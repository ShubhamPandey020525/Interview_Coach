import { useCallback, useEffect, useRef, useState } from 'react';

export interface AutoRecordOptions {
  onComplete: (blob: Blob) => void;
  onEmptyRecording?: () => void;
  onNoSpeech?: () => void;
  silenceThreshold?: number;
  silenceDurationMs?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  noSpeechTimeoutMs?: number;
}

const IS_EDGE = /(?:edg|edga|edgios|edge)\//i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');

function pickRecorderMimeType(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/wav',
  ];
  if (typeof MediaRecorder === 'undefined') return undefined;
  try {
    if (!MediaRecorder.isTypeSupported) return undefined;
  } catch { return undefined; }
  return candidates.find((t) => {
    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
  });
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoOptionsRef = useRef<AutoRecordOptions | null>(null);
  const lastSpeechRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);
  const startedAtRef = useRef<number>(0);
  const completingRef = useRef(false);
  const finalizeTimerRef = useRef<number | null>(null);
  const requestDataTimerRef = useRef<number | null>(null);

  const cancelFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current) {
      try { window.clearTimeout(finalizeTimerRef.current); } catch {}
      finalizeTimerRef.current = null;
    }
    if (requestDataTimerRef.current) {
      try { window.clearInterval(requestDataTimerRef.current); } catch {}
      requestDataTimerRef.current = null;
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current) {
      try { cancelAnimationFrame(rafRef.current); } catch {}
    }
    if (timerRef.current) {
      try { window.clearInterval(timerRef.current); } catch {}
    }
    rafRef.current = null;
    timerRef.current = null;
    setAudioLevel(0);
    if (audioCtxRef.current) {
      try {
        if (audioCtxRef.current.state !== 'closed') {
          void audioCtxRef.current.close();
        }
      } catch {}
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const releaseMicForSpeech = useCallback(() => {
    cancelFinalizeTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.onstop = () => {
          setIsRecording(false);
          mediaRecorderRef.current = null;
          autoOptionsRef.current = null;
          completingRef.current = false;
        };
        try { recorder.stop(); } catch {}
      } catch {
        mediaRecorderRef.current = null;
        autoOptionsRef.current = null;
        completingRef.current = false;
        setIsRecording(false);
      }
    } else {
      mediaRecorderRef.current = null;
      autoOptionsRef.current = null;
      completingRef.current = false;
      setIsRecording(false);
    }
    stopMeter();
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
      } catch {}
      streamRef.current = null;
    }
    setMicReady(false);
    hasSpokenRef.current = false;
  }, [stopMeter, cancelFinalizeTimer]);

  const cleanupStream = useCallback(() => {
    cancelFinalizeTimer();
    stopMeter();
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
      } catch {}
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        if (audioCtxRef.current.state !== 'closed') {
          void audioCtxRef.current.close();
        }
      } catch {}
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setMicReady(false);
  }, [stopMeter, cancelFinalizeTimer]);

  const ensureMicrophoneAccess = useCallback(async () => {
    if (streamRef.current?.active) {
      setMicReady(true);
      setPermissionDenied(false);
      setErrorMsg(null);
      return;
    }

    setPermissionDenied(false);
    setErrorMsg(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err: any) {
        setPermissionDenied(true);
        const name = err?.name ?? '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setErrorMsg('Microphone permission denied. Please allow mic access in browser settings.');
        } else if (name === 'NotFoundError') {
          setErrorMsg('No microphone found. Please connect a microphone and retry.');
        } else {
          setErrorMsg('Could not access microphone. Please check browser settings and permissions.');
        }
        throw err;
      }
    }
    streamRef.current = stream;
    setMicReady(true);
    setPermissionDenied(false);
    setErrorMsg(null);
  }, []);

  const finalizeRecording = useCallback(
    (invokeCallback: boolean) => {
      if (completingRef.current) return;
      completingRef.current = true;
      cancelFinalizeTimer();

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        const opts = autoOptionsRef.current;
        const onComplete = opts?.onComplete;
        const onEmpty = opts?.onEmptyRecording;
        const onNoSpeech = opts?.onNoSpeech;
        const spoke = hasSpokenRef.current;

        const mime = pickRecorderMimeType() || 'audio/webm';
        const blob = chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: mime })
          : null;

        if (blob) setAudioBlob(blob);
        setIsRecording(false);
        stopMeter();
        mediaRecorderRef.current = null;
        autoOptionsRef.current = null;

        if (invokeCallback) {
          if (!spoke && onNoSpeech) onNoSpeech();
          else if (blob && blob.size > 0 && onComplete) onComplete(blob);
          else if (onEmpty) onEmpty();
        }
        completingRef.current = false;
        return;
      }

      recorder.onstop = () => {
        const mime = (recorder as any).mimeType || pickRecorderMimeType() || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        const opts = autoOptionsRef.current;
        const onComplete = opts?.onComplete;
        const onEmpty = opts?.onEmptyRecording;
        const onNoSpeech = opts?.onNoSpeech;
        const spoke = hasSpokenRef.current;
        setAudioBlob(blob);
        setIsRecording(false);
        stopMeter();
        mediaRecorderRef.current = null;
        autoOptionsRef.current = null;

        if (invokeCallback) {
          if (!spoke && onNoSpeech) onNoSpeech();
          else if (blob.size > 0 && onComplete) onComplete(blob);
          else if (onEmpty) onEmpty();
        }
        completingRef.current = false;
      };

      try {
        recorder.onerror = () => {
          try { recorder.onstop?.({} as Event); } catch {}
        };
      } catch {}

      try { recorder.stop(); } catch {
        try { recorder.onstop?.({} as Event); } catch {}
      }

      finalizeTimerRef.current = window.setTimeout(() => {
        try { recorder.onstop?.({} as Event); } catch {}
      }, IS_EDGE ? 2500 : 1500);
    },
    [stopMeter, cancelFinalizeTimer]
  );

  const startMeter = useCallback(
    (stream: MediaStream) => {
      let ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        try {
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
        } catch {
          return;
        }
      }
      if (ctx.state === 'suspended') {
        try { void ctx.resume(); } catch {}
      }
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;

          try {
            analyser.getByteFrequencyData(data);
          } catch {}
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = data.length > 0 ? sum / data.length : 0;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(level);

          const opts = autoOptionsRef.current;
          const rec = mediaRecorderRef.current;
          if (opts && rec?.state === 'recording') {
            const threshold = opts.silenceThreshold ?? 12;
            const silenceMs = opts.silenceDurationMs ?? (IS_EDGE ? 3000 : 2500);
            const minMs = opts.minDurationMs ?? 800;
            const maxMs = opts.maxDurationMs ?? 120000;
            const noSpeechMs = opts.noSpeechTimeoutMs ?? (IS_EDGE ? 6000 : 5000);
            const now = Date.now();

            if (level >= threshold) {
              lastSpeechRef.current = now;
              hasSpokenRef.current = true;
            }

            const elapsed = now - startedAtRef.current;
            const silentFor = now - lastSpeechRef.current;

            if (!hasSpokenRef.current && elapsed >= noSpeechMs) {
              finalizeRecording(true);
              return;
            }

            const shouldStopOnSilence =
              hasSpokenRef.current && elapsed >= minMs && silentFor >= silenceMs;

            if (elapsed >= maxMs || shouldStopOnSilence) {
              finalizeRecording(true);
              return;
            }
          }

          rafRef.current = requestAnimationFrame(tick);
        };
        tick();

        timerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
      } catch {}
    },
    [finalizeRecording]
  );

  const startRecording = useCallback(
    async (autoOptions?: AutoRecordOptions) => {
      setPermissionDenied(false);
      setErrorMsg(null);
      setDuration(0);
      setAudioBlob(null);
      chunksRef.current = [];
      completingRef.current = false;
      autoOptionsRef.current = autoOptions ?? null;
      startedAtRef.current = Date.now();
      lastSpeechRef.current = Date.now();
      hasSpokenRef.current = false;

      try {
        if (!streamRef.current?.active) {
          await ensureMicrophoneAccess();
        }
        const stream = streamRef.current;
        if (!stream) throw new Error('Microphone not available');

        const mimeType = pickRecorderMimeType();
        const recorderOptions: MediaRecorderOptions = {};
        if (mimeType) {
          recorderOptions.mimeType = mimeType;
        }
        if (IS_EDGE) {
          recorderOptions.audioBitsPerSecond = 128000;
        }
        let recorder: MediaRecorder;
        if (Object.keys(recorderOptions).length > 0) {
          try {
            recorder = new MediaRecorder(stream, recorderOptions);
          } catch {
            try {
              recorder = new MediaRecorder(stream);
            } catch (e) {
              throw e;
            }
          }
        } else {
          recorder = new MediaRecorder(stream);
        }

        try {
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
          };
        } catch {}
        try {
          recorder.onerror = () => {
            try { finalizeRecording(true); } catch {}
          };
        } catch {}

        const chunkMs = 500;
        try {
          recorder.start(chunkMs);
        } catch {
          try { recorder.start(); } catch {}
        }

        const hasRequestData = typeof (recorder as any).requestData === 'function';
        if (hasRequestData || IS_EDGE) {
          const pushChunks = () => {
            try {
              if (mediaRecorderRef.current?.state === 'recording') {
                try { (mediaRecorderRef.current as any).requestData(); } catch {}
              }
            } catch {}
            requestDataTimerRef.current = window.setTimeout(pushChunks, IS_EDGE ? 700 : 1000);
          };
          requestDataTimerRef.current = window.setTimeout(pushChunks, IS_EDGE ? 600 : 1000);
        }

        mediaRecorderRef.current = recorder;
        startMeter(stream);
        setIsRecording(true);
      } catch (e: any) {
        setPermissionDenied(true);
        autoOptionsRef.current = null;
        if (!errorMsg) {
          setErrorMsg(e?.message ?? 'Microphone permission denied. Please allow mic access.');
        }
        throw e;
      }
    },
    [ensureMicrophoneAccess, startMeter, finalizeRecording, errorMsg]
  );

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      cancelFinalizeTimer();
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        const mime = pickRecorderMimeType() || 'audio/webm';
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mime }) : null;
        setAudioBlob(blob);
        setIsRecording(false);
        stopMeter();
        mediaRecorderRef.current = null;
        resolve(blob);
        return;
      }

      recorder.onstop = () => {
        const mime = (recorder as any).mimeType || pickRecorderMimeType() || 'audio/webm';
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mime }) : null;
        setAudioBlob(blob);
        setIsRecording(false);
        stopMeter();
        mediaRecorderRef.current = null;
        resolve(blob);
      };
      try { recorder.stop(); } catch {
        try { recorder.onstop?.({} as Event); } catch {}
      }
      finalizeTimerRef.current = window.setTimeout(() => {
        try { recorder.onstop?.({} as Event); } catch {}
      }, IS_EDGE ? 2000 : 1500);
    });
  }, [stopMeter, cancelFinalizeTimer]);

  const reset = useCallback(() => {
    releaseMicForSpeech();
    setAudioBlob(null);
    setDuration(0);
    setErrorMsg(null);
  }, [releaseMicForSpeech]);

  useEffect(() => () => { try { cleanupStream(); } catch {} }, [cleanupStream]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return {
    isRecording,
    audioBlob,
    audioLevel,
    duration,
    formattedDuration: formatDuration(duration),
    permissionDenied,
    micReady,
    errorMsg,
    ensureMicrophoneAccess,
    releaseMicForSpeech,
    startRecording,
    stopRecording,
    reset,
  };
}

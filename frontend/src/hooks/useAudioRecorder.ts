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

function pickRecorderMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [micReady, setMicReady] = useState(false);

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

  const stopMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    setAudioLevel(0);
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  /** Stop recording and release mic so browser TTS can play through speakers. */
  const releaseMicForSpeech = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.onstop = () => {
        setIsRecording(false);
        mediaRecorderRef.current = null;
        autoOptionsRef.current = null;
        completingRef.current = false;
      };
      mediaRecorderRef.current.stop();
    } else {
      mediaRecorderRef.current = null;
      autoOptionsRef.current = null;
      completingRef.current = false;
      setIsRecording(false);
    }
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMicReady(false);
    hasSpokenRef.current = false;
  }, [stopMeter]);

  const cleanupStream = useCallback(() => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setMicReady(false);
  }, [stopMeter]);

  const ensureMicrophoneAccess = useCallback(async () => {
    if (streamRef.current?.active) {
      setMicReady(true);
      setPermissionDenied(false);
      return;
    }

    setPermissionDenied(false);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    setMicReady(true);
  }, []);

  const finalizeRecording = useCallback(
    (invokeCallback: boolean) => {
      if (completingRef.current) return;
      completingRef.current = true;

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        completingRef.current = false;
        return;
      }

      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
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

        if (invokeCallback && !spoke && onNoSpeech) {
          onNoSpeech();
        } else if (invokeCallback && blob.size > 0 && onComplete) {
          onComplete(blob);
        } else if (invokeCallback && onEmpty) {
          onEmpty();
        }

        completingRef.current = false;
      };

      recorder.stop();
    },
    [stopMeter]
  );

  const startMeter = useCallback(
    (stream: MediaStream) => {
      const ctx = new AudioContext();
      void ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;

        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const level = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(level);

        const opts = autoOptionsRef.current;
        if (opts && mediaRecorderRef.current?.state === 'recording') {
          const threshold = opts.silenceThreshold ?? 10;
          const silenceMs = opts.silenceDurationMs ?? 2500;
          const minMs = opts.minDurationMs ?? 800;
          const maxMs = opts.maxDurationMs ?? 120000;
          const noSpeechMs = opts.noSpeechTimeoutMs ?? 5000;
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
    },
    [finalizeRecording]
  );

  const startRecording = useCallback(
    async (autoOptions?: AutoRecordOptions) => {
      setPermissionDenied(false);
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
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(250);
        mediaRecorderRef.current = recorder;
        startMeter(stream);
        setIsRecording(true);
      } catch {
        setPermissionDenied(true);
        autoOptionsRef.current = null;
        throw new Error('Microphone permission denied. Please allow mic access.');
      }
    },
    [ensureMicrophoneAccess, startMeter]
  );

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        const mime = 'audio/webm';
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mime }) : null;
        setAudioBlob(blob);
        setIsRecording(false);
        stopMeter();
        mediaRecorderRef.current = null;
        resolve(blob);
        return;
      }

      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mime }) : null;
        setAudioBlob(blob);
        setIsRecording(false);
        stopMeter();
        mediaRecorderRef.current = null;
        resolve(blob);
      };

      recorder.stop();
    });
  }, [stopMeter]);

  const reset = useCallback(() => {
    releaseMicForSpeech();
    setAudioBlob(null);
    setDuration(0);
  }, [releaseMicForSpeech]);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

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
    ensureMicrophoneAccess,
    releaseMicForSpeech,
    startRecording,
    stopRecording,
    reset,
  };
}

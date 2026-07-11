import { useCallback, useEffect, useRef, useState } from 'react';

export interface AutoRecordOptions {
  /** ms of silence after speech before auto-stop (default 2200) */
  silenceMs?: number;
  /** minimum recording length before silence can trigger stop (default 900) */
  minSpeechMs?: number;
  /** max recording length (default 120000) */
  maxMs?: number;
  /** audio level 0-100 treated as speech (default 10) */
  speechThreshold?: number;
  onComplete?: (blob: Blob) => void;
  onError?: (message: string) => void;
}

export function useAutoAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const optionsRef = useRef<AutoRecordOptions>({});
  const startedAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const stoppingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setAudioLevel(0);
  }, []);

  const stopRecording = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startRecording = useCallback(async (options: AutoRecordOptions = {}) => {
    if (isRecording) return;
    optionsRef.current = options;
    stoppingRef.current = false;
    setPermissionDenied(false);
    setDuration(0);
    chunksRef.current = [];

    const silenceMs = options.silenceMs ?? 2200;
    const minSpeechMs = options.minSpeechMs ?? 900;
    const maxMs = options.maxMs ?? 120_000;
    const speechThreshold = options.speechThreshold ?? 10;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cleanup();
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          optionsRef.current.onComplete?.(blob);
        }
        stoppingRef.current = false;
      };

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = ctx;

      const data = new Uint8Array(analyser.frequencyBinCount);
      startedAtRef.current = Date.now();
      lastSpeechAtRef.current = Date.now();

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const level = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(level);

        const now = Date.now();
        if (level >= speechThreshold) {
          lastSpeechAtRef.current = now;
        }

        const elapsed = now - startedAtRef.current;
        const silentFor = now - lastSpeechAtRef.current;

        if (elapsed >= maxMs) {
          stopRecording();
          return;
        }

        if (elapsed >= minSpeechMs && silentFor >= silenceMs) {
          stopRecording();
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      tick();

      timerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      setPermissionDenied(true);
      options.onError?.('Microphone permission denied. Please allow mic access.');
      throw new Error('Microphone permission denied');
    }
  }, [cleanup, isRecording, stopRecording]);

  const cancelRecording = useCallback(() => {
    stoppingRef.current = true;
    chunksRef.current = [];
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    cleanup();
    stoppingRef.current = false;
  }, [cleanup]);

  useEffect(() => () => {
    cancelRecording();
  }, [cancelRecording]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return {
    isRecording,
    audioLevel,
    duration,
    formattedDuration: formatDuration(duration),
    permissionDenied,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

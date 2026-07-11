import { useCallback, useRef, useState } from 'react';

export function useVideoRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startPreview = useCallback(async () => {
    setPermissionDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setPreviewStream(stream);
      setPreviewActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      return stream;
    } catch {
      setPermissionDenied(true);
      throw new Error('Camera/microphone permission denied');
    }
  }, []);

  const startRecording = useCallback(async () => {
    const stream = previewStream || (await startPreview());
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      setVideoBlob(new Blob(chunksRef.current, { type: 'video/webm' }));
      setPreviewActive(false);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  }, [previewStream, startPreview]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    previewStream?.getTracks().forEach((t) => t.stop());
    setPreviewStream(null);
  }, [previewStream]);

  const reset = useCallback(() => {
    setVideoBlob(null);
    chunksRef.current = [];
    previewStream?.getTracks().forEach((t) => t.stop());
    setPreviewStream(null);
    setPreviewActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [previewStream]);

  return {
    isRecording,
    videoBlob,
    videoRef,
    previewActive,
    permissionDenied,
    startPreview,
    startRecording,
    stopRecording,
    reset,
  };
}

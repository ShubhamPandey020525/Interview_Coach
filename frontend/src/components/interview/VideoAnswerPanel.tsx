import type { RefObject } from 'react';

interface VideoAnswerPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  isRecording: boolean;
  hasRecording: boolean;
  previewActive: boolean;
  permissionDenied: boolean;
  submitting: boolean;
  onStartPreview: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSubmit: () => void;
  onRetry: () => void;
}

export default function VideoAnswerPanel({
  videoRef,
  isRecording,
  hasRecording,
  previewActive,
  permissionDenied,
  submitting,
  onStartPreview,
  onStartRecording,
  onStopRecording,
  onSubmit,
  onRetry,
}: VideoAnswerPanelProps) {
  return (
    <div className="space-y-4">
      {permissionDenied && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Camera access denied. Enable it in browser settings and try again.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full object-cover"
        />
        {!previewActive && !hasRecording && (
          <div className="flex aspect-video w-full items-center justify-center bg-gray-900 text-sm text-gray-400">
            Camera preview will appear here
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Video is analyzed for engagement cues (eye contact, posture). Audio in the recording is also processed.
      </p>

      <div className="flex flex-wrap gap-2">
        {!previewActive && !hasRecording && (
          <button
            onClick={onStartPreview}
            className="rounded-lg bg-gray-700 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Enable Camera
          </button>
        )}
        {previewActive && !isRecording && (
          <button
            onClick={onStartRecording}
            className="rounded-lg bg-red-500 px-5 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            {hasRecording ? 'Re-record' : 'Start Recording'}
          </button>
        )}
        {isRecording && (
          <button
            onClick={onStopRecording}
            className="rounded-lg bg-gray-700 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Stop Recording
          </button>
        )}
        {hasRecording && !isRecording && (
          <>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Uploading…' : 'Submit Answer'}
            </button>
            <button
              onClick={onRetry}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

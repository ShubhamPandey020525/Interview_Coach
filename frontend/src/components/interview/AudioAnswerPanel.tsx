interface AudioAnswerPanelProps {
  isRecording: boolean;
  audioLevel: number;
  formattedDuration: string;
  hasRecording: boolean;
  permissionDenied: boolean;
  submitting: boolean;
  onStart: () => void;
  onStop: () => void;
  onSubmit: () => void;
  onRetry: () => void;
}

export default function AudioAnswerPanel({
  isRecording,
  audioLevel,
  formattedDuration,
  hasRecording,
  permissionDenied,
  submitting,
  onStart,
  onStop,
  onSubmit,
  onRetry,
}: AudioAnswerPanelProps) {
  return (
    <div className="space-y-4">
      {permissionDenied && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Microphone access denied. Enable it in browser settings and try again.
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
          <span>{isRecording ? 'Recording…' : hasRecording ? 'Recording ready' : 'Ready to record'}</span>
          <span className="font-mono">{formattedDuration}</span>
        </div>
        <div className="flex h-10 items-end gap-1">
          {Array.from({ length: 24 }).map((_, i) => {
            const threshold = (i / 24) * 100;
            const active = isRecording && audioLevel >= threshold;
            return (
              <div
                key={i}
                className={`w-2 rounded-sm transition-all ${active ? 'bg-red-500' : 'bg-gray-300'}`}
                style={{ height: active ? `${20 + (audioLevel / 100) * 20}px` : '8px' }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!isRecording ? (
          <button
            onClick={onStart}
            className="rounded-lg bg-red-500 px-5 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            {hasRecording ? 'Re-record' : 'Start Recording'}
          </button>
        ) : (
          <button
            onClick={onStop}
            className="rounded-lg bg-gray-700 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Stop
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

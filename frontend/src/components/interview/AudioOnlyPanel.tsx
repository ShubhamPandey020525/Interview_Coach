interface AudioOnlyPanelProps {
  isRecording: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  audioLevel: number;
  formattedDuration: string;
  permissionDenied: boolean;
  needsConsent: boolean;
  isStarting?: boolean;
  onGrantConsent: () => void;
}

export default function AudioOnlyPanel({
  isRecording,
  isSpeaking,
  isProcessing,
  audioLevel,
  formattedDuration,
  permissionDenied,
  needsConsent,
  isStarting = false,
  onGrantConsent,
}: AudioOnlyPanelProps) {
  if (needsConsent) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-teal-200 bg-teal-50/80 p-4 text-center">
        <p className="mb-3 text-xs text-teal-900">
          Fully automated voice interview — Priya asks, you answer, everything runs automatically.
        </p>
        <button
          onClick={onGrantConsent}
          className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Begin Interview
        </button>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        Microphone denied — allow mic in browser and refresh.
      </div>
    );
  }

  const statusText = isStarting
    ? 'Starting interview…'
    : isSpeaking
    ? 'Priya is speaking…'
    : isProcessing
    ? 'Processing…'
    : isRecording
    ? 'Your turn — speak now'
    : 'Stand by…';

  return (
    <div className="flex h-full flex-col justify-center rounded-xl border border-gray-200 bg-slate-50 p-3">
      <p className="mb-2 text-center text-xs font-medium text-gray-700">{statusText}</p>

      <div className="flex h-8 items-end justify-center gap-0.5">
        {Array.from({ length: 24 }).map((_, i) => {
          const threshold = (i / 24) * 100;
          const active = isRecording && audioLevel >= threshold;
          const pulse = isStarting && !isRecording && i % 3 === 0;
          return (
            <div
              key={i}
              className={`w-1 rounded-full transition-all ${
                active ? 'bg-emerald-500' : pulse ? 'animate-pulse bg-teal-400' : 'bg-gray-300'
              }`}
              style={{ height: active ? `${8 + (audioLevel / 100) * 20}px` : '6px' }}
            />
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-gray-500">
        {isRecording && (
          <>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            <span>{formattedDuration}</span>
          </>
        )}
        {isSpeaking && <span className="text-blue-600">AI speaking</span>}
        {isProcessing && <span className="text-amber-600">Evaluating</span>}
        {isStarting && !isRecording && !isSpeaking && (
          <span className="text-teal-600">Connecting voice &amp; mic…</span>
        )}
      </div>
    </div>
  );
}

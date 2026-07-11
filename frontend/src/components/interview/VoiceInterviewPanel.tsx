interface VoiceInterviewPanelProps {
  phase: 'consent' | 'ready' | 'speaking' | 'listening' | 'processing' | 'connecting';
  isRecording: boolean;
  audioLevel: number;
  formattedDuration: string;
  permissionDenied: boolean;
  onGrantConsent: () => void;
}

export default function VoiceInterviewPanel({
  phase,
  isRecording,
  audioLevel,
  formattedDuration,
  permissionDenied,
  onGrantConsent,
}: VoiceInterviewPanelProps) {
  if (phase === 'consent') {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-6 text-center">
        <p className="mb-2 text-lg font-semibold text-teal-900">Voice-only interview</p>
        <p className="mb-4 text-sm text-teal-800">
          Priya will ask questions aloud. When she finishes, your microphone opens automatically.
          Stop speaking for a moment and your answer submits on its own.
        </p>
        <button
          onClick={onGrantConsent}
          className="rounded-lg bg-teal-600 px-6 py-2.5 font-medium text-white hover:bg-teal-700"
        >
          Allow microphone & start
        </button>
      </div>
    );
  }

  const statusText =
    phase === 'connecting'
      ? 'Connecting to interviewer…'
      : phase === 'speaking'
      ? 'Priya is asking the question…'
      : phase === 'listening'
      ? isRecording
        ? 'Your turn — speak your answer'
        : 'Get ready to speak…'
      : phase === 'processing'
      ? 'Analyzing your answer…'
      : 'Preparing…';

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
      {permissionDenied && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Microphone blocked. Enable it in browser settings and refresh.
        </p>
      )}

      <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
        <span className="font-medium text-gray-800">{statusText}</span>
        {isRecording && <span className="font-mono">{formattedDuration}</span>}
      </div>

      <div className="flex h-14 items-end justify-center gap-1">
        {Array.from({ length: 32 }).map((_, i) => {
          const threshold = (i / 32) * 100;
          const active = isRecording && audioLevel >= threshold;
          return (
            <div
              key={i}
              className={`w-1.5 rounded-full transition-all duration-75 ${
                active ? 'bg-teal-500' : phase === 'speaking' ? 'bg-blue-300' : 'bg-gray-300'
              }`}
              style={{ height: active ? `${12 + (audioLevel / 100) * 32}px` : '10px' }}
            />
          );
        })}
      </div>

      {phase === 'listening' && isRecording && (
        <p className="mt-4 text-center text-xs text-gray-500">
          Pause when you&apos;re done — answer submits automatically after a short silence.
        </p>
      )}

      {phase === 'processing' && (
        <div className="mt-4 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
        </div>
      )}
    </div>
  );
}

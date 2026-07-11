export type AiInterviewerStatus = 'idle' | 'speaking' | 'listening' | 'thinking';

interface InterviewerPersonaProps {
  status: AiInterviewerStatus;
  statusLabel: string;
  compact?: boolean;
}

const statusRing: Record<AiInterviewerStatus, string> = {
  idle: 'ring-gray-300',
  speaking: 'ring-blue-400 animate-pulse',
  listening: 'ring-emerald-400',
  thinking: 'ring-amber-400 animate-pulse',
};

export default function InterviewerPersona({ status, statusLabel, compact }: InterviewerPersonaProps) {
  const avatarSize = compact ? 'h-16 w-16' : 'h-28 w-28';
  const innerSize = compact ? 'h-14 w-14 text-2xl font-bold tracking-wider' : 'h-24 w-24 text-4xl font-bold tracking-wider';
  const titleSize = compact ? 'text-sm' : 'text-lg';

  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`relative mb-2 flex ${avatarSize} items-center justify-center rounded-full bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 ring-4 ${statusRing[status]} shadow-md`}
      >
        <div className={`flex ${innerSize} items-center justify-center rounded-full bg-white/10 text-white font-sans`}>
          J
        </div>
        {status === 'speaking' && (
          <span className="absolute -bottom-1 flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-2 w-2 animate-bounce rounded-full bg-blue-400"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        )}
        {status === 'listening' && (
          <span className="absolute -bottom-1 h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
        )}
      </div>
      <h2 className={`${titleSize} font-semibold text-gray-900`}>James — AI Interviewer</h2>
      <p className="mt-0.5 max-w-[140px] text-[11px] leading-tight text-gray-600">{statusLabel}</p>
    </div>
  );
}

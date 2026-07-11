export type TimelineLine = {
  id: string;
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
  meta?: string;
};

interface ConversationTimelineProps {
  lines: TimelineLine[];
  compact?: boolean;
}

export default function ConversationTimeline({ lines, compact }: ConversationTimelineProps) {
  const visible = compact ? lines.slice(-3) : lines;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <h2 className="mb-2 shrink-0 text-xs font-semibold text-gray-700">Live Transcript</h2>
      <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
        {visible.length === 0 ? (
          <p className="text-xs text-gray-400">Conversation appears here…</p>
        ) : (
          visible.map((line) => (
            <div
              key={line.id}
              className={`rounded-lg px-2.5 py-2 text-xs ${
                line.role === 'interviewer'
                  ? 'border-l-2 border-blue-400 bg-blue-50 text-blue-900'
                  : line.role === 'candidate'
                  ? 'border-l-2 border-gray-400 bg-gray-50 text-gray-900'
                  : 'border-l-2 border-amber-400 bg-amber-50 text-amber-900'
              }`}
            >
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">
                {line.role === 'interviewer' ? 'Priya' : line.role === 'candidate' ? 'You' : 'System'}
              </p>
              <p className="line-clamp-3 leading-snug">{line.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

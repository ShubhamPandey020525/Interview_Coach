interface StageProgressProps {
  currentStage: string | null;
  questionNumber: number;
  maxQuestions?: number;
}

const STAGES = ['technical', 'followup', 'scenario'] as const;

export default function StageProgress({
  currentStage,
  questionNumber,
  maxQuestions = 8,
}: StageProgressProps) {
  const progress = Math.min(100, Math.round((questionNumber / maxQuestions) * 100));

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>Question {questionNumber} of ~{maxQuestions}</span>
        <span className="capitalize">{currentStage?.replace('_', ' ') || 'starting'}</span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex gap-2">
        {STAGES.map((stage) => (
          <span
            key={stage}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
              currentStage === stage
                ? 'bg-teal-100 text-teal-800'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {stage}
          </span>
        ))}
      </div>
    </div>
  );
}

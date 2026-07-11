import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getReport } from '../api/sessions';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function SessionReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['report', sessionId],
    queryFn: () => getReport(sessionId!),
    retry: false,
  });

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">This session is not completed yet.</p>
        <Link to={`/interview/${sessionId}`} className="text-teal-700 hover:underline">
          Return to interview
        </Link>
      </div>
    );
  }

  if (!report) return null;

  const chartData = report.attempts.map((a, i) => ({
    name: `Q${i + 1}`,
    score: a.score ?? 0,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white p-6">
        <h1 className="text-2xl font-bold text-gray-900">Interview Complete</h1>
        <p className="mt-1 text-gray-600">Here’s how you performed and what to focus on next.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">Overall Score</p>
          <p className="text-4xl font-bold text-[var(--color-primary)]">{report.overall_score.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-green-700 mb-2">Strengths</p>
          <ul className="text-sm text-gray-600 space-y-1">
            {report.strengths.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-medium text-amber-700 mb-2">Areas to Improve</p>
          <ul className="text-sm text-gray-600 space-y-1">
            {report.weaknesses.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="font-semibold mb-4">Score Breakdown</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Bar dataKey="score" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="font-semibold mb-4">Q&A Timeline with Detailed Feedback</h2>
        <div className="space-y-6">
          {report.attempts.map((a, i) => (
            <div key={a.attempt_id} className="border-l-2 border-teal-300 pl-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{a.agent_type}</span>
                <span className="text-sm font-medium">Q{i + 1}</span>
                {a.score != null && <span className="text-sm text-teal-700">{a.score.toFixed(0)}%</span>}
              </div>
              <p className="text-sm text-gray-800 font-medium mb-2">{a.question_text}</p>
              
              {a.answer_text && (
                <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Your Answer:</p>
                  <p className="text-sm text-gray-700">{a.answer_text}</p>
                </div>
              )}

              {a.best_answer && (
                <div className="mb-3 p-3 bg-green-50 rounded-lg">
                  <p className="text-xs font-semibold text-green-700 mb-1">Best Answer Example:</p>
                  <p className="text-sm text-gray-700">{a.best_answer}</p>
                </div>
              )}

              {a.user_answer_comparison && (
                <div className="mb-3 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Feedback:</p>
                  <p className="text-sm text-gray-700">{a.user_answer_comparison}</p>
                </div>
              )}

              {a.factual_inaccuracies && a.factual_inaccuracies.length > 0 && (
                <div className="mb-3 p-3 bg-red-50 rounded-lg">
                  <p className="text-xs font-semibold text-red-700 mb-1">Factual Inaccuracies:</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {a.factual_inaccuracies.map((inaccuracy, idx) => (
                      <li key={idx}>• {inaccuracy}</li>
                    ))}
                  </ul>
                </div>
              )}

              {a.weighted_breakdown && (
                <div className="mb-3 p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs font-semibold text-purple-700 mb-2">Weighted Score Breakdown:</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(a.weighted_breakdown)
                      .filter(([key]) => key !== 'total' && key !== 'weights')
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-600">
                            {key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')}:
                          </span>
                          <span className="font-medium text-gray-800">
                            {typeof value === 'number' ? value.toFixed(1) : JSON.stringify(value)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                {a.filler_word_count != null && (
                  <div className="text-xs text-gray-500">
                    Filler Words: <span className="font-medium">{a.filler_word_count}</span>
                  </div>
                )}
                {a.metrics && Object.entries(a.metrics).map(([key, value]) => (
                  <div key={key} className="text-xs text-gray-500">
                    {key.charAt(0).toUpperCase() + key.slice(1)}: <span className="font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {report.learning_plan.weak_areas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold mb-2">Recommended Next Steps</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {report.learning_plan.weak_areas.map((area) => (
              <span key={area} className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">
                {area}
              </span>
            ))}
          </div>
          {report.learning_plan.recommended_resources.length > 0 && (
            <ul className="mb-4 space-y-2 text-sm text-gray-600">
              {report.learning_plan.recommended_resources.slice(0, 3).map((r, i) => (
                <li key={i}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">
                    {r.title}
                  </a>
                  <span className="text-gray-400"> · {r.type}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-3">
            <Link
              to="/learning-plan"
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              View Learning Plan
            </Link>
            <Link
              to="/progress"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Track Progress
            </Link>
            <Link
              to="/dashboard"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Practice Again
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

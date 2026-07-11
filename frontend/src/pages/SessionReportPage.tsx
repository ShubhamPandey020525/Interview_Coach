import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getReport } from '../api/sessions';

export default function SessionReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['report', sessionId],
    queryFn: () => getReport(sessionId!),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
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

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header Panel */}
      <div className="mb-8 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white p-6">
        <h1 className="text-2xl font-bold text-gray-900">Interview Evaluation Report</h1>
        <p className="mt-1 text-gray-600">Review your response transcripts, speech patterns, and ideal answers suggestions below.</p>
      </div>

      {/* Strengths & Weaknesses Cards (No Scores/Numbers) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-bold text-emerald-800 uppercase tracking-wider mb-2">Strengths Identified</p>
          <ul className="text-sm text-gray-700 space-y-1.5">
            {report.strengths.map((s, i) => (
              <li key={i} className="flex items-start">
                <span className="text-emerald-500 mr-2">✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-2">Recommended Areas to Improve</p>
          <ul className="text-sm text-gray-700 space-y-1.5">
            {report.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start">
                <span className="text-amber-500 mr-2">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Q&A Detailed Performance Cards */}
      <div className="bg-slate-50 rounded-xl border border-gray-200 p-6 mb-8 shadow-sm">
        <h2 className="font-bold text-lg text-gray-900 mb-6">Detailed Q&A Performance Report</h2>
        <div className="space-y-8">
          {report.attempts.map((a, i) => (
            <div key={a.attempt_id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow duration-150">
              {/* Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-teal-600 capitalize">
                    {a.agent_type} Stage
                  </span>
                  <span className="text-sm font-bold text-gray-700">Question {i + 1}</span>
                </div>
              </div>

              {/* Question Text */}
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Interviewer Question</p>
                <p className="text-sm text-gray-900 font-semibold bg-slate-50 border border-slate-100 rounded-lg p-3 leading-relaxed">
                  "{a.question_text}"
                </p>
              </div>
              
              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* User Answer Column */}
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Your Answer</p>
                    {a.filler_word_count != null && (
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        a.filler_word_count > 0 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {a.filler_word_count > 0 
                          ? `⚠️ ${a.filler_word_count} filler words` 
                          : '✓ No filler words'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-700 bg-white border border-slate-100 rounded p-2.5 min-h-[100px] whitespace-pre-wrap">
                    {a.answer_text || 'No answer provided.'}
                  </p>
                </div>

                {/* Best Answer Column */}
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">Model's Best Answer Example</p>
                  <p className="text-xs leading-relaxed text-gray-800 bg-white border border-emerald-100 rounded p-2.5 min-h-[100px] whitespace-pre-wrap">
                    {a.best_answer || 'Ideal answer suggestions are not available for this turn.'}
                  </p>
                </div>
              </div>

              {/* Feedback and Comparison */}
              {a.user_answer_comparison && (
                <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-2">Feedback &amp; Key Differences</p>
                  <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">{a.user_answer_comparison}</p>
                </div>
              )}

              {/* Factual Inaccuracies */}
              {a.factual_inaccuracies && a.factual_inaccuracies.length > 0 && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-2">⚠️ Factual Inaccuracies Spotted</p>
                  <ul className="list-disc pl-4 space-y-1">
                    {a.factual_inaccuracies.map((inaccuracy, idx) => (
                      <li key={idx} className="text-xs text-rose-950 font-medium">{inaccuracy}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Resource Links (Bypass unused page routes) */}
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
            <ul className="mb-6 space-y-2 text-sm text-gray-600">
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
              to="/dashboard"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Practice Again
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

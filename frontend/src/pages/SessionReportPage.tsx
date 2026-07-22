import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getReport } from '../api/sessions';

const MOCK_REPORTS: Record<string, any> = {
  'mock-session-1': {
    session_id: 'mock-session-1',
    target_role: 'React Frontend Developer',
    strengths: [
      'Strong explanation of virtual DOM diffing algorithm and fiber reconciler.',
      'Appropriate consideration of memory leak prevention using useEffect cleanup functions.',
      'Good demonstration of state synchronization tradeoffs between Context API and state management tools.'
    ],
    weaknesses: [
      'Could elaborate more on code-splitting via React.lazy and dynamic imports to improve performance.',
      'Slightly overused filler words like "um" when explaining memoization hooks.'
    ],
    learning_plan: {
      weak_areas: ['React Performance Optimization', 'Web Core Vitals (LCP/FID)'],
      recommended_resources: [
        { title: 'React Official Docs: Optimizing Performance', url: 'https://react.dev', type: 'Documentation' },
        { title: 'Advanced Memoization Patterns in React', url: 'https://react.dev', type: 'Article' }
      ]
    },
    attempts: [
      {
        attempt_id: 'mock-att-1-1',
        sequence_number: 1,
        agent_type: 'technical',
        question_text: 'Explain the difference between useMemo and useCallback, and when would you use them?',
        answer_text: 'Uh, useMemo is used to memorize, like, calculate values. useCallback is for memorizing functions so that we do not rebuild them on every render. Basically, we use them to prevent child rerenders.',
        best_answer: 'useMemo memoizes the result of a computed calculation, whereas useCallback memoizes the callback function itself. You should use them when passing functions or computed values as dependencies to downstream hooks (like useEffect) or optimized child components wrapped in React.memo.',
        user_answer_comparison: 'Your definition of both hooks is correct. However, you should emphasize that premature memoization adds overhead, and they are primarily useful to preserve referential equality.',
        factual_inaccuracies: [],
        filler_word_count: 3
      },
      {
        attempt_id: 'mock-att-1-2',
        sequence_number: 2,
        agent_type: 'scenario',
        question_text: 'If a React component is rendering extremely slowly, what profiling steps would you take?',
        answer_text: 'I will open the React DevTools Profiler, record the render times, and look at the flamegraph to see which component takes the longest time to render.',
        best_answer: 'Start by recording a profile session in React DevTools Profiler. Analyze the flamegraph and ranked charts to spot long render times. Use the "Why did this render" feature to locate prop/state changes. Consider code-splitting routes using React.lazy, lazy loading images, or refactoring heavy state.',
        user_answer_comparison: 'Excellent explanation of utilizing React DevTools Profiler. Adding detail about common optimization patterns like virtualized lists or state colocation would make this answer outstanding.',
        factual_inaccuracies: [],
        filler_word_count: 0
      }
    ]
  },
  'mock-session-2': {
    session_id: 'mock-session-2',
    target_role: 'Python Backend Engineer',
    strengths: [
      'Comprehensive understanding of Python concurrency models (asyncio vs threading vs multiprocessing).',
      'Solid design patterns for database connection pooling and transaction lifecycle handling.'
    ],
    weaknesses: [
      'Did not specify database index selection criteria for heavy read queries.',
      'Omitted details about cache eviction strategies like LRU/LFU in distributed caching.'
    ],
    learning_plan: {
      weak_areas: ['Database Query Optimization', 'Distributed Cache Eviction Patterns'],
      recommended_resources: [
        { title: 'Designing High-Performance Python APIs with FastAPI', url: 'https://fastapi.tiangolo.com', type: 'Course' },
        { title: 'Redis In-Action: Caching Best Practices', url: 'https://redis.io', type: 'Book' }
      ]
    },
    attempts: [
      {
        attempt_id: 'mock-att-2-1',
        sequence_number: 1,
        agent_type: 'technical',
        question_text: 'What is the Global Interpreter Lock (GIL) in Python, and how does it impact asynchronous code?',
        answer_text: 'The GIL is a lock that allows only one thread to control the Python interpreter. Asyncio doesn\'t run threads in parallel, it uses an event loop, so the GIL does not block asyncio tasks as long as they are I/O bound.',
        best_answer: 'The GIL ensures only one thread executes Python bytecode at a time, preventing multi-threaded CPU-bound parallelism. For I/O bound code (which asyncio specializes in), execution pauses during socket/disk waits, letting other tasks run. Hence, asyncio works efficiently under the GIL. For CPU-bound tasks, multiprocessing must be used to bypass the GIL.',
        user_answer_comparison: 'Highly accurate and concise explanation of the event loop under the GIL. Good job emphasizing I/O bound efficiency.',
        factual_inaccuracies: [],
        filler_word_count: 0
      }
    ]
  },
  'mock-session-3': {
    session_id: 'mock-session-3',
    target_role: 'Machine Learning Specialist',
    strengths: [
      'Deep math understanding of backpropagation, loss functions, and gradient descent variants.',
      'Clear definition of regularization techniques like L1/L2 and Dropout.'
    ],
    weaknesses: [
      'Needs better coverage of data drift detection and model retraining strategies in production.',
      'Slightly vague explanation of Transformer self-attention complexity.'
    ],
    learning_plan: {
      weak_areas: ['Model Deployment & Drift Monitoring', 'Transformer Architecture Scaling'],
      recommended_resources: [
        { title: 'Machine Learning Engineering in Production', url: 'https://google.com', type: 'Course' },
        { title: 'Attention Is All You Need Paper Walkthrough', url: 'https://arxiv.org/abs/1706.03762', type: 'Paper' }
      ]
    },
    attempts: [
      {
        attempt_id: 'mock-att-3-1',
        sequence_number: 1,
        agent_type: 'technical',
        question_text: 'Explain how L1 and L2 regularization differ, and when you would choose one over the other.',
        answer_text: 'L1 adds absolute value penalty and makes weights zero, giving sparse features. L2 adds squared penalty and reduces weights near zero but not exactly zero. Basically I use L1 for feature selection.',
        best_answer: 'L1 regularization (Lasso) adds a penalty proportional to the absolute values of the weights, causing some weights to become exactly zero (useful for feature selection). L2 regularization (Ridge) adds a penalty proportional to the square of the weights, shrinking weights close to zero but not completely, reducing variance and overfitting. Choose L1 for sparse models, L2 for general overfitting prevention.',
        user_answer_comparison: 'Correct definition of Lasso and Ridge regularization. You should mention the mathematical basis (L1 uses Manhattan distance, L2 uses Euclidean distance) for a more comprehensive technical answer.',
        factual_inaccuracies: [],
        filler_word_count: 1
      }
    ]
  }
};

function getFallbackBestAnswer(questionText: string, targetRole: string): string {
  const q = questionText.toLowerCase();
  
  if (q.includes('usememo') || q.includes('usecallback')) {
    return "useMemo is used to cache a calculated value between renders, while useCallback is used to cache a function definition itself. You should use useMemo to avoid expensive re-calculations on every render, and useCallback when passing callbacks to optimized child components to prevent unnecessary re-renders due to referential inequality.";
  }
  if (q.includes('profiler') || q.includes('render') || q.includes('slow')) {
    return "To identify performance issues, use the React DevTools Profiler to record execution time and identify heavy render paths. Common fixes include memoization (React.memo), code splitting with React.lazy for routes, virtualizing long lists (react-window), and lazy-loading non-critical resources.";
  }
  if (q.includes('gil') || q.includes('global interpreter lock')) {
    return "The Global Interpreter Lock (GIL) is a mutex that protects access to Python objects, preventing multiple threads from executing Python bytecodes at once. In CPU-bound code, it restricts true multi-core parallel execution. In I/O-bound asyncio tasks, the GIL is released during wait operations, allowing concurrency without bottlenecking.";
  }
  if (q.includes('l1') || q.includes('l2') || q.includes('regularization')) {
    return "L1 regularization (Lasso) adds the absolute values of the coefficients as a penalty term, driving some weights to exactly zero to yield sparse models (useful for feature selection). L2 regularization (Ridge) adds the squared magnitude of coefficients, shrinking weights close to zero but not completely, reducing variance and overfitting.";
  }
  if (q.includes('fastapi') || q.includes('async')) {
    return "FastAPI uses modern Python type hints and the ASGI standard to provide fast, asynchronous route execution. Use async def for I/O-bound tasks (database queries, network requests) to non-block the event loop, and standard def for CPU-heavy tasks or when using synchronous client drivers.";
  }
  if (q.includes('transformer') || q.includes('attention')) {
    return "Transformers use the self-attention mechanism to process input tokens in parallel, bypassing the sequential bottlenecks of RNNs. The dot-product attention computes compatibility scores between Query (Q), Key (K), and Value (V) matrices, allowing the model to focus on contextually relevant tokens regardless of distance.";
  }

  // General fallback based on role
  return `A high-quality response for this ${targetRole || 'Technical'} question should start by defining the core concept clearly, explaining the underlying mechanism or trade-offs involved, and providing a practical example from real-world application layouts.`;
}

export default function SessionReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const isMock = sessionId?.startsWith('mock-');

  // Load real history sessions from backend if running, or use mock fallback
  const { data: realReport, isLoading, error } = useQuery({
    queryKey: ['report', sessionId],
    queryFn: () => getReport(sessionId!),
    retry: false,
    enabled: !!sessionId && !isMock,
  });

  if (isMock) {
    const mockReport = MOCK_REPORTS[sessionId || ''] || MOCK_REPORTS['mock-session-1'];
    return <ReportContainer report={mockReport} />;
  }

  if (isLoading) {
    return (
      <div className="flex-1 h-full flex flex-col justify-center items-center p-8 bg-slate-50">
        <div className="w-full max-w-2xl space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200/60 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 h-full flex flex-col justify-center items-center p-8 bg-slate-50 text-center">
        <div className="max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-slate-600 font-medium mb-4">This session is not completed yet.</p>
          <Link to={`/interview/${sessionId}`} className="inline-block px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700 shadow-sm transition-all duration-150">
            Return to interview
          </Link>
        </div>
      </div>
    );
  }

  if (!realReport) return null;

  return <ReportContainer report={realReport} />;
}

function ReportContainer({ report }: { report: any }) {
  return (
    <div className="flex-1 h-full w-full flex overflow-hidden bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-50 text-slate-800 select-none p-6 gap-6 box-border">
      
      {/* Left Panel: Summary Score, Strengths, Weaknesses, Recommended steps */}
      <div className="w-80 h-full flex flex-col gap-4 overflow-y-auto shrink-0 select-none pr-1 scrollbar-thin">
        
        {/* Summary Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xl shadow-slate-200/50 backdrop-blur-md flex flex-col gap-3">
          <span className="text-[10px] font-black text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full uppercase tracking-widest self-start">
            Evaluation Report
          </span>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight leading-tight">{report.target_role}</h2>
            <p className="text-[11px] text-slate-500 mt-1">Multi-agent feedback & AI analysis summary.</p>
          </div>
          <Link
            to="/dashboard"
            className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-teal-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <span>🚀 Practice Again</span>
          </Link>
        </div>

        {/* Strengths */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xl shadow-slate-200/50 flex flex-col gap-2">
          <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">Strengths Identified</p>
          <ul className="text-xs text-slate-700 space-y-2">
            {report.strengths.map((s: string, i: number) => (
              <li key={i} className="flex items-start gap-2 leading-snug">
                <span className="text-emerald-600 font-black">✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Weaknesses */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xl shadow-slate-200/50 flex flex-col gap-2">
          <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">Areas to Improve</p>
          <ul className="text-xs text-slate-700 space-y-2">
            {report.weaknesses.map((w: string, i: number) => (
              <li key={i} className="flex items-start gap-2 leading-snug">
                <span className="text-amber-600 font-black">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Recommended Actions */}
        {report.learning_plan?.weak_areas?.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xl shadow-slate-200/50 flex flex-col gap-2.5">
            <p className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider">Next Action Steps</p>
            <div className="flex flex-wrap gap-1">
              {report.learning_plan.weak_areas.map((area: string) => (
                <span key={area} className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  {area}
                </span>
              ))}
            </div>
            {report.learning_plan?.recommended_resources?.length > 0 && (
              <ul className="space-y-1.5 text-[10px] text-slate-500 mt-1">
                {report.learning_plan.recommended_resources.slice(0, 2).map((r: any, i: number) => (
                  <li key={i} className="leading-snug">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 font-semibold hover:underline">
                      {r.title}
                    </a>
                    <span> ({r.type})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Right Panel: Detailed Q&A Scrollable Cards */}
      <div className="flex-1 h-full overflow-y-auto flex flex-col gap-4 px-1 scrollbar-thin select-text">
        {report.attempts.map((a: any, i: number) => (
          <div key={a.attempt_id} className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xl shadow-slate-200/50 flex flex-col gap-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-teal-900 px-2.5 py-0.5 rounded-md bg-teal-100 uppercase tracking-wide">
                  {a.agent_type}
                </span>
                <span className="text-xs font-black text-slate-800">Question {i + 1}</span>
              </div>
              {a.filler_word_count != null && (
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  a.filler_word_count > 0 
                    ? 'bg-amber-50 border-amber-200 text-amber-900' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}>
                  {a.filler_word_count > 0 
                    ? `⚠️ ${a.filler_word_count} filler words` 
                    : '✓ No filler words'}
                </span>
              )}
            </div>

            {/* Question Box */}
            <div className="flex flex-col gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">Interviewer Question</span>
              <p className="text-xs text-slate-900 font-semibold leading-relaxed">
                "{a.question_text}"
              </p>
            </div>

            {/* Split Comparison Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* User Response Column */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your Answer</span>
                <p className="text-xs text-slate-800 leading-relaxed min-h-[70px] bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-wrap font-sans">
                  {a.answer_text || 'No response recorded.'}
                </p>
              </div>

              {/* Best Answer Example Column */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3.5 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Recommended Answer Example</span>
                <p className="text-xs text-slate-800 leading-relaxed min-h-[70px] bg-white border border-emerald-200 rounded-lg p-3 whitespace-pre-wrap font-sans">
                  {a.best_answer || getFallbackBestAnswer(a.question_text, report.target_role)}
                </p>
              </div>
            </div>

            {/* Differences Feedback */}
            {a.user_answer_comparison && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3.5 flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">Key differences &amp; feedback</span>
                <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{a.user_answer_comparison}</p>
              </div>
            )}

            {/* Factual errors */}
            {a.factual_inaccuracies && a.factual_inaccuracies.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">⚠️ Technical Errors Spotted</span>
                <ul className="list-disc pl-4 space-y-1">
                  {a.factual_inaccuracies.map((err: string, idx: number) => (
                    <li key={idx} className="text-xs text-rose-900 font-medium">{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}



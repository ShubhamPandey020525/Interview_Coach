import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listSessions } from '../../api/sessions';
import { useAuthStore } from '../../store/authStore';

const MOCK_SESSIONS = [
  {
    id: 'mock-session-1',
    user_id: '9cc71b23-2008-49a2-b351-d85bcbb049af',
    target_role: 'React Frontend Developer',
    session_name: 'React Developer Round',
    status: 'completed' as const,
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'mock-session-2',
    user_id: '9cc71b23-2008-49a2-b351-d85bcbb049af',
    target_role: 'Python Backend Engineer',
    session_name: 'Python Backend Engineer Round',
    status: 'completed' as const,
    created_at: new Date(Date.now() - 172800000).toISOString()
  },
  {
    id: 'mock-session-3',
    user_id: '9cc71b23-2008-49a2-b351-d85bcbb049af',
    target_role: 'Machine Learning Specialist',
    session_name: 'Machine Learning Specialist Round',
    status: 'completed' as const,
    created_at: new Date(Date.now() - 259200000).toISOString()
  }
];

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Load real history sessions from backend if running, or default to mock
  const { data: sessionData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => listSessions(1),
    retry: false,
    staleTime: 30000,
  });

  const activeSessions = sessionData?.items || [];
  // Unify real database sessions with mock sessions to ensure history list is always populated
  const allSessions = [...activeSessions];
  MOCK_SESSIONS.forEach(mock => {
    if (!allSessions.some(s => s.id === mock.id)) {
      allSessions.push(mock);
    }
  });

  const handleSessionClick = (id: string) => {
    navigate(`/sessions/${id}/report`);
  };

  const handleNewInterview = () => {
    navigate('/dashboard');
  };

  const formatSessionDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans antialiased select-none">
      {/* Sidebar on the Left */}
      <aside className="w-80 h-full border-r border-slate-200 bg-white flex flex-col justify-between shrink-0 shadow-sm z-10">
        
        {/* Top Section */}
        <div className="flex flex-col h-full min-h-0">
          
          {/* Header/Logo */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-md shadow-teal-600/20">
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <span className="text-base font-extrabold text-slate-800 tracking-tight">Interview Coach</span>
            </Link>
          </div>

          {/* Setup Action */}
          <div className="p-4">
            <button
              onClick={handleNewInterview}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/10 hover:shadow-teal-700/20 transition-all duration-150 transform active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Practice Round
            </button>
          </div>

          {/* Scrollable Chat History */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 space-y-1 scrollbar-thin">
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Saved Chat History</p>
            {allSessions.map((s) => {
              const isSelected = location.pathname.includes(`/sessions/${s.id}`);
              return (
                <button
                  key={s.id}
                  onClick={() => handleSessionClick(s.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all duration-150 flex flex-col gap-1 border ${
                    isSelected
                      ? 'bg-teal-50 border-teal-200 text-teal-900 shadow-sm'
                      : 'border-transparent hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold truncate leading-snug">{s.target_role}</span>
                    {s.id.startsWith('mock') && (
                      <span className="text-[8px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase">Mock</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{formatSessionDate(s.created_at)}</span>
                    <span className="capitalize text-[9px] font-semibold text-teal-600">{s.status}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: User Details & Logout */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-teal-100 border border-teal-200 flex items-center justify-center font-bold text-teal-800 text-sm">
              {(user?.name || 'G')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 truncate leading-tight">{user?.name || 'Guest User'}</p>
              <p className="text-[10px] text-slate-500 truncate leading-tight">{user?.email || 'guest@example.com'}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-full py-2 border border-slate-200 hover:bg-red-50 hover:border-red-150 hover:text-red-700 text-slate-600 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Area (Fits exactly in viewport, no scrollbar on this parent container) */}
      <main className="flex-1 h-full overflow-hidden flex flex-col min-w-0 bg-slate-50">
        <Outlet />
      </main>
    </div>
  );
}

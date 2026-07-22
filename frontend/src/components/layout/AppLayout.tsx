import { Link, Outlet } from 'react-router-dom';

export default function AppLayout() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-sans antialiased text-slate-900 select-none">
      {/* Top Ultra-Clean Navigation Bar */}
      <header className="shrink-0 h-14 border-b border-emerald-100 bg-white/90 backdrop-blur-md px-6 flex items-center justify-between shadow-xs z-20">
        
        {/* Brand Logo */}
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-all">
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <span className="text-base font-black tracking-tight text-slate-900 group-hover:text-emerald-700 transition-colors">
            Interview<span className="text-emerald-600">Coach</span>
          </span>
        </Link>

        {/* Candidate Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-xs font-bold text-emerald-900">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Candidate Mode</span>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col min-w-0 bg-white">
        <Outlet />
      </main>
    </div>
  );
}

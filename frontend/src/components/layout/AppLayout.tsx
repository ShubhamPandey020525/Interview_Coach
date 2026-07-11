import { Link, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { SKIP_AUTH } from '../../config/auth';

export default function AppLayout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link to="/dashboard" className="text-xl font-semibold text-[var(--color-primary)]">
          Interview Coach
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="text-gray-600 hover:text-gray-950 font-medium">Dashboard</Link>
          <span className="text-sm text-gray-500">{user?.name || 'Guest'}</span>
          {!SKIP_AUTH && (
            <button
              onClick={() => logout()}
              className="text-sm text-gray-600 hover:text-gray-950"
            >
              Logout
            </button>
          )}
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

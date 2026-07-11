import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { checkHealth } from './api/auth';
import { SKIP_AUTH } from './config/auth';
import AppLayout from './components/layout/AppLayout';
import AuthBootstrap from './components/layout/AuthBootstrap';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import InterviewConsolePage from './pages/InterviewConsolePage';
import SessionReportPage from './pages/SessionReportPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

function BackendStatus() {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const healthy = await checkHealth();
      if (!cancelled) setOk(healthy);
    };
    check();
    const interval = window.setInterval(check, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);
  if (ok) return null;
  return (
    <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-center text-sm text-red-700">
      Backend unreachable. Make sure the API server is running on port 8000.
    </div>
  );
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (SKIP_AUTH) return <Navigate to="/dashboard" replace />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>
        <BrowserRouter>
          <BackendStatus />
          <Routes>
            <Route
              path="/"
              element={SKIP_AUTH ? <Navigate to="/dashboard" replace /> : <LandingPage />}
            />
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/interview/:sessionId" element={<ProtectedRoute><InterviewConsolePage /></ProtectedRoute>} />
              <Route path="/sessions/:sessionId/report" element={<ProtectedRoute><SessionReportPage /></ProtectedRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthBootstrap>
    </QueryClientProvider>
  );
}

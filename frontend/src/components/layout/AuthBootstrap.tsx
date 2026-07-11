import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { SKIP_AUTH } from '../../config/auth';

export default function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const authReady = useAuthStore((s) => s.authReady);
  const initializeAuth = useAuthStore((s) => s.initializeAuth);

  useEffect(() => {
    if (SKIP_AUTH) {
      initializeAuth();
    }
  }, [initializeAuth]);

  if (SKIP_AUTH && !authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
          <p className="text-sm text-gray-600">Starting interview coach…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

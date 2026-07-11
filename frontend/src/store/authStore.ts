import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../api/types';
import { login as apiLogin, logout as apiLogout, register as apiRegister } from '../api/auth';
import type { LoginRequest, RegisterRequest } from '../api/types';
import { DEMO_EMAIL, DEMO_PASSWORD, SKIP_AUTH } from '../config/auth';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  reauthenticate: () => Promise<boolean>;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      authReady: !SKIP_AUTH,

      login: async (data) => {
        const res = await apiLogin(data);
        set({
          user: res.user,
          accessToken: res.access_token,
          refreshToken: res.refresh_token,
          isAuthenticated: true,
          authReady: true,
        });
      },

      register: async (data) => {
        const res = await apiRegister(data);
        set({
          user: res.user,
          accessToken: res.access_token,
          refreshToken: res.refresh_token,
          isAuthenticated: true,
          authReady: true,
        });
      },

      logout: async () => {
        if (SKIP_AUTH) return;
        const refresh = get().refreshToken;
        if (refresh) {
          try {
            await apiLogout(refresh);
          } catch {
            // Best effort cleanup.
          }
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      initializeAuth: async () => {
        if (!SKIP_AUTH) {
          set({ authReady: true });
          return;
        }

        // Always fetch fresh tokens in dev — stale localStorage tokens break after SECRET_KEY/backend restart
        try {
          await get().login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
        } catch {
          try {
            await get().register({
              name: 'Demo User',
              email: DEMO_EMAIL,
              password: DEMO_PASSWORD,
              target_role: 'Software Engineer',
              experience_level: 'junior',
            });
          } catch {
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
            });
          }
        }
        set({ authReady: true });
      },

      reauthenticate: async () => {
        if (!SKIP_AUTH) return false;
        try {
          await get().login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
          return true;
        } catch {
          try {
            await get().register({
              name: 'Demo User',
              email: DEMO_EMAIL,
              password: DEMO_PASSWORD,
              target_role: 'Software Engineer',
              experience_level: 'junior',
            });
            return true;
          } catch {
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
            });
            return false;
          }
        }
      },

      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true }),
      setUser: (user) => set({ user }),
    }),
    { name: 'auth-storage' }
  )
);

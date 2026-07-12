import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../api/types';
import { login as apiLogin, logout as apiLogout, register as apiRegister } from '../api/auth';
import type { LoginRequest, RegisterRequest } from '../api/types';
import { DEMO_EMAIL, SKIP_AUTH } from '../config/auth';

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
        // Bypass backend login completely
        set({
          user: {
            id: '9cc71b23-2008-49a2-b351-d85bcbb049af',
            name: 'Demo User',
            email: data.email || 'demo@example.com',
            role: 'user',
            target_role: 'Software Engineer',
            experience_level: 'junior',
            is_active: true,
          },
          accessToken: 'dummy-token',
          refreshToken: 'dummy-token',
          isAuthenticated: true,
          authReady: true,
        });
      },

      register: async (data) => {
        // Bypass backend registration completely
        set({
          user: {
            id: '9cc71b23-2008-49a2-b351-d85bcbb049af',
            name: data.name || 'Demo User',
            email: data.email || 'demo@example.com',
            role: 'user',
            target_role: data.target_role || 'Software Engineer',
            experience_level: data.experience_level || 'junior',
            is_active: true,
          },
          accessToken: 'dummy-token',
          refreshToken: 'dummy-token',
          isAuthenticated: true,
          authReady: true,
        });
      },

      logout: async () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      initializeAuth: async () => {
        // Let zustand persist handle rehydration, but always ensure authReady is true
        set({ authReady: true });
      },

      reauthenticate: async () => {
        set({
          user: {
            id: '9cc71b23-2008-49a2-b351-d85bcbb049af',
            name: 'Demo User',
            email: DEMO_EMAIL,
            role: 'user',
            target_role: 'Software Engineer',
            experience_level: 'junior',
            is_active: true,
          },
          accessToken: 'dummy-token',
          refreshToken: 'dummy-token',
          isAuthenticated: true,
        });
        return true;
      },

      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true }),
      setUser: (user) => set({ user }),
    }),
    { name: 'auth-storage' }
  )
);

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from './types';
import { useAuthStore } from '../store/authStore';
import { SKIP_AUTH } from '../config/auth';

const IS_EDGE = /edg\//i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');

function normalizeBase(url: string | undefined): string {
  const base = url || 'http://127.0.0.1:8000';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

const BASE = normalizeBase((import.meta as any).env?.VITE_API_BASE_URL);

const api = axios.create({
  baseURL: BASE,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  },
  timeout: IS_EDGE ? 240000 : 180000,
  withCredentials: true,
  withXSRFToken: false,
  maxRedirects: 5,
  validateStatus: (status) => status >= 200 && status < 500,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    try {
      config.headers.setAuthorization(`Bearer ${token}`);
    } catch {
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  }
  const method = (config.method || '').toLowerCase();
  if (method === 'get') {
    const nonce = Date.now() + '_' + Math.floor(Math.random() * 1000000);
    if (typeof config.params === 'object' && config.params && !('__' in config.params)) {
      config.params = { ...config.params, __: nonce };
    } else if (!config.params) {
      config.params = { __: nonce };
    }
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else if (token) prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const looksLikeNetwork =
      !error.response &&
      (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || !error.code);

    if (looksLikeNetwork && !originalRequest._retry) {
      originalRequest._retry = true;
      const method = (originalRequest.method || '').toLowerCase();
      if (method === 'get' || method === 'head' || method === 'options') {
        try {
          return await api(originalRequest);
        } catch (secondError) {
          error = secondError as AxiosError<ApiError>;
        }
      }
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              try {
                originalRequest.headers.setAuthorization(`Bearer ${token}`);
              } catch {
                (originalRequest.headers as any).Authorization = `Bearer ${token}`;
              }
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      const refreshToken = useAuthStore.getState().refreshToken;

      if (!refreshToken) {
        isRefreshing = false;
        if (!SKIP_AUTH) {
          useAuthStore.getState().logout();
          window.location.href = '/login';
        } else {
          try {
            await useAuthStore.getState().reauthenticate();
            const newAccess = useAuthStore.getState().accessToken;
            if (newAccess) {
              try {
                originalRequest.headers.setAuthorization(`Bearer ${newAccess}`);
              } catch {
                (originalRequest.headers as any).Authorization = `Bearer ${newAccess}`;
              }
              return api(originalRequest);
            }
          } catch (reauthErr) {
            return Promise.reject(reauthErr);
          }
        }
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<{ access_token: string; refresh_token: string }>(
          `${BASE}/api/auth/refresh`,
          { refresh_token: refreshToken },
          { withCredentials: true, timeout: 25000 }
        );
        useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
        processQueue(null, data.access_token);
        try {
          originalRequest.headers.setAuthorization(`Bearer ${data.access_token}`);
        } catch {
          (originalRequest.headers as any).Authorization = `Bearer ${data.access_token}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (SKIP_AUTH) {
          try {
            const ok = await useAuthStore.getState().reauthenticate();
            if (ok) {
              const newAccess = useAuthStore.getState().accessToken;
              if (newAccess) {
                try {
                  originalRequest.headers.setAuthorization(`Bearer ${newAccess}`);
                } catch {
                  (originalRequest.headers as any).Authorization = `Bearer ${newAccess}`;
                }
                return api(originalRequest);
              }
            }
          } catch {
          }
        } else {
          useAuthStore.getState().logout();
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiError>(error)) {
    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. Is the backend running on port 8000?';
    }
    if (!error.response) {
      return 'Cannot reach backend. Start it with: uvicorn app.main:app --reload --port 8000';
    }
    const data = error.response?.data;
    if (data) {
      const detailMsg =
        (data as any).detail ||
        (data as any).message ||
        (data as any).error?.message ||
        (data as any).error;
      if (detailMsg) {
        if (typeof detailMsg === 'string') return detailMsg;
        if (Array.isArray(detailMsg)) {
          const first = detailMsg[0];
          if (first && typeof first === 'object' && 'msg' in first) return String((first as any).msg);
          return String(first);
        }
        if (typeof detailMsg === 'object') {
          try { return JSON.stringify(detailMsg); } catch { return String(detailMsg); }
        }
      }
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

export default api;

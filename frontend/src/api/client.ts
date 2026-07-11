import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from './types';
import { useAuthStore } from '../store/authStore';
import { SKIP_AUTH } from '../config/auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
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
        if (!SKIP_AUTH) {
          useAuthStore.getState().logout();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<{ access_token: string; refresh_token: string }>(
          `${import.meta.env.VITE_API_BASE_URL}/api/auth/refresh`,
          { refresh_token: refreshToken }
        );
        useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
        processQueue(null, data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (SKIP_AUTH) {
          const ok = await useAuthStore.getState().reauthenticate();
          if (ok) {
            const newAccess = useAuthStore.getState().accessToken;
            if (newAccess) {
              originalRequest.headers.Authorization = `Bearer ${newAccess}`;
              return api(originalRequest);
            }
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
    return error.response?.data?.error?.message || error.message;
  }
  return 'An unexpected error occurred';
}

export default api;

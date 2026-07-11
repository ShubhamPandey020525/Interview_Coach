import api from './client';
import type { AuthResponse, LoginRequest, RegisterRequest } from './types';

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/api/auth/register', data);
  return res.data;
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/api/auth/login', data);
  return res.data;
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post('/api/auth/logout', { refresh_token: refreshToken });
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await api.get('/api/health', { timeout: 3000 });
    return res.data.status === 'ok';
  } catch {
    return false;
  }
}

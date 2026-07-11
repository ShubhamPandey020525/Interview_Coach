import api from './client';
import type { ResumeProfile, User } from './types';

export async function getMe(): Promise<User> {
  const res = await api.get<User>('/api/users/me');
  return res.data;
}

export async function updateMe(data: Partial<User>): Promise<User> {
  const res = await api.put<User>('/api/users/me', data);
  return res.data;
}

export async function uploadResume(file: File): Promise<ResumeProfile> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post<ResumeProfile>('/api/profile/resume', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
  return res.data;
}

export async function getResume(): Promise<ResumeProfile> {
  const res = await api.get<ResumeProfile>('/api/profile/resume');
  return res.data;
}

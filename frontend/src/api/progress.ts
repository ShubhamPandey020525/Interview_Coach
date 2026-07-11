import api from './client';
import type { LearningPlan, ProgressData } from './types';

export async function getUserLearningPlan(userId: string): Promise<LearningPlan> {
  const res = await api.get<LearningPlan>(`/api/users/${userId}/learning-plan`);
  return res.data;
}

export async function getSessionLearningPlan(sessionId: string): Promise<LearningPlan> {
  const res = await api.get<LearningPlan>(`/api/sessions/${sessionId}/learning-plan`);
  return res.data;
}

export async function getUserProgress(userId: string): Promise<ProgressData> {
  const res = await api.get<ProgressData>(`/api/users/${userId}/progress`);
  return res.data;
}

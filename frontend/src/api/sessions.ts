import api from './client';
import type {
  AnswerResponse,
  InterviewSession,
  NextQuestion,
  PaginatedResponse,
  SessionReport,
} from './types';

export async function createSession(sessionName: string): Promise<InterviewSession> {
  const res = await api.post<InterviewSession>('/api/sessions', { session_name: sessionName });
  return res.data;
}

export async function listSessions(page = 1): Promise<PaginatedResponse<InterviewSession>> {
  const res = await api.get<PaginatedResponse<InterviewSession>>('/api/sessions', {
    params: { page, page_size: 20 },
  });
  return res.data;
}

export async function getSession(id: string): Promise<InterviewSession> {
  const res = await api.get<InterviewSession>(`/api/sessions/${id}`);
  return res.data;
}

export async function getNextQuestion(id: string): Promise<NextQuestion> {
  const res = await api.get<NextQuestion>(`/api/sessions/${id}/next-question`);
  return res.data;
}

export async function submitAnswer(
  sessionId: string,
  attemptId: string,
  answerText?: string,
  audio?: Blob,
  video?: Blob
): Promise<AnswerResponse> {
  const form = new FormData();
  form.append('attempt_id', attemptId);
  if (answerText) form.append('answer_text', answerText);
  if (audio) form.append('audio', audio, 'recording.webm');
  if (video) form.append('video', video, 'recording.webm');
  const res = await api.post<AnswerResponse>(`/api/sessions/${sessionId}/answer`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function completeSession(id: string): Promise<InterviewSession> {
  const res = await api.post<InterviewSession>(`/api/sessions/${id}/complete`);
  return res.data;
}

export async function getReport(id: string): Promise<SessionReport> {
  const res = await api.get<SessionReport>(`/api/sessions/${id}/report`);
  return res.data;
}

export async function deleteSession(id: string): Promise<void> {
  await api.delete(`/api/sessions/${id}`);
}

export async function deleteAllSessions(): Promise<void> {
  await api.delete('/api/sessions');
}

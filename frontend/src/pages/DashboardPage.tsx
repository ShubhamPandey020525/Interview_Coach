import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listSessions, createSession, deleteSession, deleteAllSessions } from '../api/sessions';
import { getUserProgress } from '../api/progress';
import { getResume, getMe } from '../api/profile';
import { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { primeSpeechForInterview } from '../utils/speechText';
import type { InterviewSession, PaginatedResponse, ProgressData } from '../api/types';

function patchSessionsCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (old: PaginatedResponse<InterviewSession>) => PaginatedResponse<InterviewSession>
) {
  queryClient.setQueryData<PaginatedResponse<InterviewSession>>(['sessions'], (old) => {
    if (!old) return old;
    return updater(old);
  });
}

function patchProgressCache(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  updater: (old: ProgressData) => ProgressData
) {
  if (!userId) return;
  queryClient.setQueryData<ProgressData>(['progress', userId], (old) => {
    if (!old) return old;
    return updater(old);
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [resumeError, setResumeError] = useState('');

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const profile = await getMe();
      setUser(profile);
      return profile;
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  });

  const targetRole = me?.target_role || user?.target_role || '';

  const { data: resume } = useQuery({
    queryKey: ['resume'],
    queryFn: getResume,
    enabled: !!accessToken,
    retry: false,
    staleTime: 60_000,
  });

  const hasResume = !!resume && (resume.skills?.length > 0 || resume.experience_summary);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => listSessions(),
    enabled: !!accessToken,
    staleTime: 0,
  });

  const { data: progress } = useQuery({
    queryKey: ['progress', user?.id],
    queryFn: () => getUserProgress(user!.id),
    enabled: !!accessToken && !!user?.id,
    staleTime: 30_000,
  });

  const [sessionName, setSessionName] = useState('');

  const createMutation = useMutation({
    mutationFn: () => createSession(sessionName.trim()),
    onSuccess: (session) => {
      sessionStorage.setItem('interview_auto_start', '1');
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      navigate(`/interview/${session.id}`);
    },
    onError: (err) => setResumeError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSession,
    onSuccess: async (_, deletedId) => {
      patchSessionsCache(queryClient, (old) => {
        const items = old.items.filter((s) => s.id !== deletedId);
        return { ...old, items, total: Math.max(0, old.total - 1) };
      });
      patchProgressCache(queryClient, user?.id, (old) => ({
        ...old,
        sessions: old.sessions.filter((s) => s.session_id !== deletedId),
      }));
      await queryClient.refetchQueries({ queryKey: ['sessions'] });
      await queryClient.refetchQueries({ queryKey: ['progress', user?.id] });
    },
    onError: (err) => setResumeError(getErrorMessage(err)),
  });

  const deleteAllMutation = useMutation({
    mutationFn: deleteAllSessions,
    onSuccess: async () => {
      patchSessionsCache(queryClient, (old) => ({
        ...old,
        items: [],
        total: 0,
      }));
      patchProgressCache(queryClient, user?.id, (old) => ({
        ...old,
        sessions: [],
        trend_metrics: Object.fromEntries(
          Object.keys(old.trend_metrics).map((key) => [key, []])
        ),
      }));
      await queryClient.refetchQueries({ queryKey: ['sessions'] });
      await queryClient.refetchQueries({ queryKey: ['progress', user?.id] });
    },
    onError: (err) => setResumeError(getErrorMessage(err)),
  });

  const handleStart = () => {
    setResumeError('');
    if (!hasResume) {
      navigate('/onboarding');
      return;
    }
    if (!targetRole.trim()) {
      setResumeError('Set your target role on Upload Resume page first.');
      navigate('/onboarding');
      return;
    }
    if (!sessionName.trim()) {
      setResumeError('Enter a name for this interview session.');
      return;
    }
    primeSpeechForInterview();
    createMutation.mutate();
  };

  const chartData =
    progress?.sessions.map((s) => ({
      date: new Date(s.date).toLocaleDateString(),
      score: s.overall_score,
    })) || [];

  return (
    <div>
      <div className="mb-6 rounded-xl border-2 border-teal-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">New Interview Session Name</h1>
        <p className="mt-1 text-sm text-gray-600">
          Welcome back, {user?.name}. Give this session any name you like — your target role comes from
          your profile.
        </p>

        {targetRole && (
          <p className="mt-3 text-sm text-gray-700">
            Target role:{' '}
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 font-medium text-teal-800">
              {targetRole}
            </span>
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className="ml-2 text-xs text-teal-700 underline"
            >
              Change on Upload Resume
            </button>
          </p>
        )}

        {!hasResume ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Upload your resume first.
            <button onClick={() => navigate('/onboarding')} className="ml-2 font-semibold underline">
              Upload Resume
            </button>
          </div>
        ) : !targetRole ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Set your target role on the resume page first.
            <button onClick={() => navigate('/onboarding')} className="ml-2 font-semibold underline">
              Upload Resume
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Session name</label>
              <input
                autoFocus
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                placeholder="e.g. Practice Round 1, Mock Interview Tuesday"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <button
              onClick={handleStart}
              disabled={createMutation.isPending}
              className="shrink-0 rounded-lg bg-[var(--color-primary)] px-8 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Starting…' : 'Start Interview'}
            </button>
          </div>
        )}

        {resumeError && <p className="mt-3 text-sm text-red-600">{resumeError}</p>}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">Total Sessions</p>
          <p className="text-2xl font-bold text-[var(--color-primary)]">{sessions?.total ?? 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500">Completed</p>
          <p className="text-2xl font-bold">
            {sessions?.items.filter((s) => s.status === 'completed').length ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="mb-1 text-xs text-gray-500">Recent Progress</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={chartData}>
                <Line type="monotone" dataKey="score" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400">No data yet</p>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Recent Sessions</h2>
        {sessions && sessions.items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Delete all sessions? This cannot be undone.')) {
                deleteAllMutation.mutate();
              }
            }}
            disabled={deleteAllMutation.isPending}
            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            {deleteAllMutation.isPending ? 'Deleting…' : 'Delete all'}
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : sessions?.items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-8 text-center text-sm text-gray-500">
          No past sessions — start your first interview above.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions?.items.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-teal-300"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  sessionStorage.setItem('interview_auto_start', '1');
                  session.status === 'completed'
                    ? navigate(`/sessions/${session.id}/report`)
                    : navigate(`/interview/${session.id}`);
                }}
              >
                <p className="font-medium">{session.session_name || session.target_role}</p>
                <p className="text-xs text-gray-500">
                  {session.target_role} · {new Date(session.created_at).toLocaleDateString()} ·{' '}
                  {session.status.replace('_', ' ')}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    session.status === 'completed'
                      ? 'bg-green-50 text-green-700'
                      : session.status === 'in_progress'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  {session.status.replace('_', ' ')}
                </span>
                <button
                  type="button"
                  title="Delete session"
                  disabled={deleteMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete "${session.session_name || session.target_role}"?`)) {
                      deleteMutation.mutate(session.id);
                    }
                  }}
                  className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

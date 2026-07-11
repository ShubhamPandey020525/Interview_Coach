import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSession } from '../api/sessions';
import { getResume, uploadResume, updateMe, getMe } from '../api/profile';
import { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { primeSpeechForInterview } from '../utils/speechText';

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [file, setFile] = useState<File | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [targetRole, setTargetRole] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [error, setError] = useState('');

  // Get current user profile
  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const profile = await getMe();
      setUser(profile);
      if (!targetRole && profile.target_role) {
        setTargetRole(profile.target_role);
      }
      return profile;
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  });

  // Check if user already has a parsed resume on mount
  const { data: existingResume, isLoading: loadingResume } = useQuery({
    queryKey: ['resume'],
    queryFn: getResume,
    enabled: !!accessToken,
    retry: false,
  });

  useEffect(() => {
    if (existingResume) {
      setSkills(existingResume.skills || []);
    }
  }, [existingResume]);

  useEffect(() => {
    if (user?.target_role && !targetRole) {
      setTargetRole(user.target_role);
    }
  }, [user, targetRole]);

  // Upload/Parse Resume Mutation
  const uploadMutation = useMutation({
    mutationFn: uploadResume,
    onSuccess: (data) => {
      setSkills(data.skills || []);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['resume'] });
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  // Create Interview Session Mutation
  const createMutation = useMutation({
    mutationFn: () => createSession(sessionName.trim() || `Session - ${new Date().toLocaleDateString()}`),
    onSuccess: (session) => {
      sessionStorage.setItem('interview_auto_start', '1');
      navigate(`/interview/${session.id}`);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const handleUpload = () => {
    setError('');
    if (!file) {
      setError('Please select a resume file first.');
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleStart = async () => {
    setError('');
    const hasParsedResume = skills.length > 0 || (existingResume && (existingResume.skills?.length > 0 || existingResume.experience_summary));
    
    if (!hasParsedResume) {
      setError('Please upload and parse your resume before starting the interview.');
      return;
    }
    if (!targetRole.trim()) {
      setError('Please enter a target role.');
      return;
    }

    try {
      // Save target role in profile first
      if (user?.target_role !== targetRole.trim()) {
        const updated = await updateMe({ target_role: targetRole.trim() });
        setUser(updated);
      }
      primeSpeechForInterview();
      createMutation.mutate();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">AI Voice Interview Simulator</h1>
        <p className="mt-2 text-sm text-gray-600">
          Upload your resume, enter your target role, and practice high-standard live technical and behavioral interviews with James.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border-2 border-teal-100 p-6 sm:p-8 shadow-md space-y-8">
        {/* Step 1: Resume Upload */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-800">
            Step 1: Upload &amp; Parse Resume (PDF or DOCX)
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 file:font-semibold hover:file:bg-teal-100"
            />
            <button
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 shrink-0"
            >
              {uploadMutation.isPending ? 'Parsing resume…' : 'Upload & Parse'}
            </button>
          </div>

          {loadingResume ? (
            <p className="text-xs text-gray-400">Checking resume...</p>
          ) : (skills.length > 0 || existingResume) ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 mt-3">
              <p className="text-xs font-semibold text-emerald-800 mb-2">Resume parsed successfully!</p>
              {(skills.length > 0 || existingResume?.skills) && (
                <div className="flex flex-wrap gap-1.5">
                  {(skills.length > 0 ? skills : (existingResume?.skills || [])).slice(0, 10).map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-medium">
                      {s}
                    </span>
                  ))}
                  {(skills.length > 0 ? skills : (existingResume?.skills || [])).length > 10 && (
                    <span className="text-[10px] text-emerald-700 font-medium self-center ml-1">
                      +{(skills.length > 0 ? skills : (existingResume?.skills || [])).length - 10} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-600">No resume uploaded yet. Please upload your resume to generate tailoured questions.</p>
          )}
        </div>

        {/* Step 2: Target Role & Session Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-800">Step 2: Target Role</label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Frontend Engineer, ML Scientist"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-800">Session Name (Optional)</label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. GenAI Prep Round"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Step 3: Trigger */}
        <button
          onClick={handleStart}
          disabled={createMutation.isPending}
          className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 py-3 text-base font-bold text-white shadow-md hover:shadow-lg transition disabled:opacity-50"
        >
          {createMutation.isPending ? 'Starting Interview...' : 'Start AI Interview'}
        </button>
      </div>
    </div>
  );
}

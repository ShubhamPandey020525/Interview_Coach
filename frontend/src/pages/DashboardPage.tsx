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
    <div className="flex-1 w-full h-full flex flex-col justify-center items-center p-6 bg-slate-50 overflow-hidden">
      <div className="w-full max-w-xl flex flex-col gap-6">
        
        {/* Banner Title */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-tight">AI Voice Interview Simulator</h1>
          <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
            Upload your resume, input your target role, and practice high-fidelity mock technical interviews with real-time feedback.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600 font-medium">
            {error}
          </div>
        )}

        {/* Setup card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col gap-5">
          
          {/* Step 1: Resume Upload */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Step 1: Upload Resume (PDF or DOCX)</span>
            <div className="flex gap-2.5 items-center">
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:bg-teal-50 file:text-teal-700 file:font-semibold hover:file:bg-teal-100/80 cursor-pointer"
              />
              <button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-xs font-bold transition-all disabled:opacity-50 shrink-0 shadow-md shadow-teal-600/5 active:scale-[0.98]"
              >
                {uploadMutation.isPending ? 'Parsing…' : 'Parse'}
              </button>
            </div>

            {loadingResume ? (
              <p className="text-[10px] text-slate-400">Checking existing resume...</p>
            ) : (skills.length > 0 || existingResume) ? (
              <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-3 mt-1">
                <p className="text-[10px] font-bold text-emerald-800 flex items-center gap-1 mb-1.5">
                  <span className="text-emerald-500">✓</span> Resume parsing complete!
                </p>
                <div className="flex flex-wrap gap-1">
                  {(skills.length > 0 ? skills : (existingResume?.skills || [])).slice(0, 8).map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-emerald-100/70 border border-emerald-200/40 text-emerald-800 rounded text-[9px] font-bold">
                      {s}
                    </span>
                  ))}
                  {(skills.length > 0 ? skills : (existingResume?.skills || [])).length > 8 && (
                    <span className="text-[9px] text-emerald-700 font-bold self-center ml-1">
                      +{(skills.length > 0 ? skills : (existingResume?.skills || [])).length - 8} more
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-amber-600 font-semibold mt-1">⚠️ Please upload your resume to generate tailored interview questions.</p>
            )}
          </div>

          {/* Step 2: Target Role & Session Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Step 2: Target Role</label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Frontend Engineer"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3.5 py-2.5 text-xs text-slate-700 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Session Name (Optional)</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. GenAI prep"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3.5 py-2.5 text-xs text-slate-700 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Step 3: Trigger */}
          <button
            onClick={handleStart}
            disabled={createMutation.isPending}
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 py-3 text-sm font-bold text-white shadow-md shadow-teal-600/10 hover:shadow-teal-700/20 transition-all duration-150 transform active:scale-[0.98] disabled:opacity-50 mt-1"
          >
            {createMutation.isPending ? 'Starting Interview...' : 'Start AI Interview'}
          </button>
        </div>
      </div>
    </div>
  );
}

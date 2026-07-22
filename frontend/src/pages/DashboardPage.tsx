import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSession } from '../api/sessions';
import { getResume, uploadResume, updateMe, getMe } from '../api/profile';
import { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { primeSpeechForInterview } from '../utils/speechText';

const QUICK_ROLES = [
  'React Frontend Engineer',
  'Python Backend Lead',
  'Full Stack AI Developer',
  'System Design Architect',
  'Data Scientist / ML Engineer',
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [targetRole, setTargetRole] = useState('');
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
    mutationFn: () => createSession(targetRole.trim() || 'AI Technical Interview'),
    onSuccess: (session) => {
      sessionStorage.setItem('interview_auto_start', '1');
      navigate(`/interview/${session.id}`);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const handleUpload = () => {
    setError('');
    if (!file) {
      setError('Please select a resume PDF or DOCX file first.');
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
      setError('Please select or type your target role.');
      return;
    }

    try {
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
    <div className="flex-1 w-full h-full flex flex-col justify-center items-center px-6 md:px-12 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/40 text-slate-900 overflow-hidden relative select-none">
      
      {/* Light Theme Design Background (Green Accent Spots "Green Chitte") */}
      <div className="absolute top-10 left-12 w-80 h-80 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[420px] h-[420px] bg-teal-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-8 right-12 w-80 h-80 bg-teal-300/20 rounded-full blur-3xl pointer-events-none" />
      
      {/* Geometric Decorative Accent Rings */}
      <div className="absolute -top-16 -left-16 w-[450px] h-[450px] rounded-full border border-emerald-200/60 pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-[500px] h-[500px] rounded-full border border-teal-200/60 pointer-events-none" />

      {/* Dot Grid Texture */}
      <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1.5px,transparent_1.5px)] [background-size:28px_28px] opacity-60 pointer-events-none" />

      {/* Hero 2-Column Side-Aligned Viewport Content */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center z-10 py-6">
        
        {/* Left Column: Side-aligned Copy & CTA */}
        <div className="lg:col-span-7 flex flex-col items-start text-left gap-5">
          
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3.5 py-1 text-xs font-bold text-emerald-900 uppercase tracking-widest shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>AI Voice Interview Studio</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
            Practice Real Mock Rounds with <br />
            <span className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 bg-clip-text text-transparent">
              AI Interviewers
            </span>
          </h1>

          <p className="text-sm md:text-base text-slate-600 max-w-xl leading-relaxed font-medium">
            Upload your resume, select your target tech role, and take realistic voice mock interviews. Receive deep multi-agent evaluations on technical accuracy, filler words, and improvement plans.
          </p>

          {/* Feature Bullet Points */}
          <div className="flex flex-col gap-2.5 my-1">
            <div className="flex items-center gap-3 text-xs font-bold text-slate-800">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">✓</div>
              <span>Realistic Edge-TTS Voice Audio Questions (Male & Female Personas)</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-slate-800">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">✓</div>
              <span>Live Speech-to-Text Answer Recording via Whisper</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-slate-800">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">✓</div>
              <span>8-Agent LangGraph System Detailed Feedback Report</span>
            </div>
          </div>

          {/* CTA Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-3 group relative inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-700 hover:to-teal-700 px-8 py-4 text-base font-black text-white shadow-xl shadow-emerald-600/20 transition-all duration-200 transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
          >
            <span>🚀 Let's Get Started</span>
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>

        {/* Right Column: Classy Interactive Green & White Preview Showcase Card */}
        <div className="lg:col-span-5 flex justify-center w-full">
          <div className="w-full max-w-md bg-white border border-emerald-200/90 rounded-3xl p-6 shadow-2xl shadow-emerald-900/5 backdrop-blur-2xl flex flex-col gap-5 relative overflow-hidden group hover:border-emerald-300 transition-all">
            
            {/* Top Avatar & Waveform Status */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-emerald-600/20 border border-emerald-400">
                  J
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">James — AI Interviewer</h3>
                  <span className="text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">Ready</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Edge-TTS Natural Voice Active</p>
              </div>
            </div>

            {/* Static Audio Waveform Bar */}
            <div className="rounded-2xl bg-emerald-50/50 border border-emerald-100 p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 h-6">
                {[40, 75, 55, 90, 60, 85, 45, 95, 70, 50, 80, 60, 90, 40].map((h, idx) => (
                  <div
                    key={idx}
                    className="w-1 bg-gradient-to-t from-emerald-600 to-teal-500 rounded-full"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <span className="text-[11px] font-mono font-bold text-emerald-800">00:24</span>
            </div>

            {/* Question Sample Box */}
            <div className="rounded-2xl bg-slate-50/80 border border-slate-200 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest">Question Preview</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">Technical</span>
              </div>
              <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                "Explain how you have applied Numpy scaling in your project and the trade-offs you considered."
              </p>
            </div>

            {/* Agent Stack Badges */}
            <div className="flex items-center justify-between pt-1 text-[10px] font-extrabold text-slate-500">
              <span>8 AI Agents Active</span>
              <div className="flex gap-1.5">
                <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md">Technical</span>
                <span className="px-2 py-0.5 bg-teal-50 border border-teal-200 text-teal-800 rounded-md">Audio</span>
                <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-md">Scenario</span>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Setup Green & White Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-emerald-200/90 rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl shadow-slate-900/10 flex flex-col gap-6 relative text-slate-800">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Interview Studio Setup</h2>
                <p className="text-xs text-slate-500 mt-0.5">Upload your resume to generate tailored technical questions.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 font-semibold flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Step 1: Upload & Parse Resume */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">1</span>
                  Upload Resume (PDF / DOCX)
                </span>
                {loadingResume && <span className="text-[10px] text-slate-400">Checking existing resume...</span>}
              </div>

              <div className="flex gap-2.5 items-center">
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:py-2.5 file:px-3.5 file:rounded-xl file:border-0 file:bg-emerald-50 file:text-emerald-800 file:font-bold hover:file:bg-emerald-100 cursor-pointer border border-slate-200 rounded-xl bg-slate-50/50 p-1"
                />
                <button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-5 py-2.5 text-xs font-black shadow-md shadow-emerald-600/10 transition-all active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {uploadMutation.isPending ? 'Parsing...' : 'Parse ⚡'}
                </button>
              </div>

              {/* Parsed Resume Chips */}
              {(skills.length > 0 || existingResume) && (
                <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-3 mt-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                      <span className="text-emerald-600 font-black">✓</span> Resume Parsed & Ready
                    </p>
                    <span className="text-[9px] bg-emerald-100 border border-emerald-300 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      {(skills.length > 0 ? skills : (existingResume?.skills || [])).length} Skills Extracted
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(skills.length > 0 ? skills : (existingResume?.skills || [])).slice(0, 8).map((s) => (
                      <span key={s} className="px-2.5 py-1 bg-white border border-emerald-200 text-emerald-800 rounded-lg text-[10px] font-bold shadow-xs">
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
              )}
            </div>

            {/* Step 2: Target Role */}
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">2</span>
                Target Role
              </span>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. React Frontend Engineer or Python Lead"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-800 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none transition-all placeholder:text-slate-400 font-semibold"
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTargetRole(r)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                      targetRole === r
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-900 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-200 hover:text-emerald-800'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Launch Interview Button */}
            <button
              onClick={handleStart}
              disabled={createMutation.isPending}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 py-3.5 text-xs font-black text-white shadow-xl shadow-emerald-600/20 transition-all duration-200 transform hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 mt-1 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{createMutation.isPending ? 'Launching Interview Studio...' : 'Start AI Voice Interview ➔'}</span>
            </button>

          </div>
        </div>
      )}
    </div>
  );
}

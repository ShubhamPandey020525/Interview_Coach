import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { uploadResume } from '../api/profile';
import { updateMe } from '../api/profile';
import { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const [file, setFile] = useState<File | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [targetRole, setTargetRole] = useState(user?.target_role || '');
  const [error, setError] = useState('');

  const uploadMutation = useMutation({
    mutationFn: uploadResume,
    onSuccess: (data) => {
      setSkills(data.skills);
      setError('');
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const handleUpload = () => {
    if (!file) {
      setError('Please select a resume file');
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleContinue = async () => {
    if (skills.length === 0) {
      setError('Upload and parse your resume first. Questions are generated only from your resume.');
      return;
    }
    if (!targetRole.trim()) {
      setError('Please enter your target role.');
      return;
    }
    try {
      const updated = await updateMe({ target_role: targetRole });
      setUser(updated);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-2">Welcome! Let's set up your profile</h1>
      <p className="text-gray-600 mb-8">Upload your resume so we can tailor interview questions to your background.</p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Resume (PDF or DOCX)</label>
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700"
          />
          <button
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            className="mt-3 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Parsing resume…' : 'Upload & Parse'}
          </button>
        </div>

        {skills.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Detected Skills</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span key={s} className="px-3 py-1 bg-teal-50 text-teal-800 rounded-full text-sm">{s}</span>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Role</label>
          <input
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
        </div>

        <button
          onClick={handleContinue}
          disabled={skills.length === 0}
          className="w-full py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          Continue to Dashboard
        </button>
      </div>
    </div>
  );
}

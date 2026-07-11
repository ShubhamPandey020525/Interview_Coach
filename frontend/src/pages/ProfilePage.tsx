import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { updateMe } from '../api/profile';
import { getErrorMessage } from '../api/client';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [targetRole, setTargetRole] = useState(user?.target_role || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSave = async () => {
    try {
      const updated = await updateMe({ name, target_role: targetRole });
      setUser(updated);
      setMessage('Profile updated successfully');
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-8">Profile</h1>
      {message && <p className="text-green-600 text-sm mb-4">{message}</p>}
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input value={user?.email || ''} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Role</label>
          <input
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:opacity-90"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

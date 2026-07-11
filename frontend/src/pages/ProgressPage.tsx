import { useQuery } from '@tanstack/react-query';
import { getUserProgress } from '../api/progress';
import { useAuthStore } from '../store/authStore';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';

export default function ProgressPage() {
  const user = useAuthStore((s) => s.user);

  const { data: progress, isLoading } = useQuery({
    queryKey: ['progress', user?.id],
    queryFn: () => getUserProgress(user!.id),
    enabled: !!user?.id,
  });

  if (isLoading) {
    return <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />;
  }

  const sessions = progress?.sessions || [];
  const lineData = sessions.map((s) => ({
    date: new Date(s.date).toLocaleDateString(),
    score: s.overall_score,
  }));

  const radarData = Object.entries(progress?.trend_metrics || {}).map(([key, values]) => ({
    skill: key,
    score: values.length > 0 ? values[values.length - 1] : 0,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Your Progress</h1>

      {sessions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">Complete your first interview to see progress trends.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold mb-4">Overall Score Trend</h2>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={lineData}>
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="var(--color-primary)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {radarData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold mb-4">Skill Radar</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="skill" />
                    <Radar dataKey="score" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Date</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Score</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.session_id} className="border-t border-gray-100">
                    <td className="px-6 py-4 text-sm">{new Date(s.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm font-medium">{s.overall_score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

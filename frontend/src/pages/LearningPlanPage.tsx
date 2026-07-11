import { useQuery } from '@tanstack/react-query';
import { getUserLearningPlan } from '../api/progress';
import { useAuthStore } from '../store/authStore';

export default function LearningPlanPage() {
  const user = useAuthStore((s) => s.user);

  const { data: plan, isLoading, error } = useQuery({
    queryKey: ['learning-plan', user?.id],
    queryFn: () => getUserLearningPlan(user!.id),
    enabled: !!user?.id,
    retry: false,
  });

  if (isLoading) return <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />;

  if (error || !plan) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Complete an interview to get your personalized learning plan.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Learning Plan</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="font-semibold mb-4">Focus Areas</h2>
        <div className="flex flex-wrap gap-2">
          {plan.weak_areas.map((area) => (
            <span key={area} className="px-4 py-2 bg-amber-50 text-amber-800 rounded-lg text-sm">{area}</span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-4">Recommended Resources</h2>
        <div className="space-y-4">
          {plan.recommended_resources.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 border border-gray-100 rounded-lg hover:border-teal-300 transition-colors"
            >
              <p className="font-medium">{r.title}</p>
              <p className="text-sm text-gray-500">{r.type}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

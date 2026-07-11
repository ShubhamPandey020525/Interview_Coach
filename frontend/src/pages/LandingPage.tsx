import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white">
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          AI Technical Interview Coach
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Practice realistic, adaptive mock interviews with AI. Get personalized feedback,
          identify weak areas, and track your progress over time.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/signup"
            className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:opacity-90"
          >
            Get Started
          </Link>
          <Link
            to="/login"
            className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

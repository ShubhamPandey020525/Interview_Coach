// API types mirroring backend Pydantic schemas (snake_case)

export interface ErrorDetail {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface ApiError {
  error: ErrorDetail;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  experience_level?: string | null;
  target_role?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  target_role?: string;
  experience_level?: 'student' | 'fresher' | 'junior' | 'mid' | 'senior' | 'architect';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ResumeProfile {
  id: string;
  user_id: string;
  raw_file_path: string;
  skills: string[];
  projects: Array<{ name: string; description: string; tech_stack: string[] }>;
  experience_summary: string | null;
  parsed_at: string;
  created_at: string;
}

export interface InterviewSession {
  id: string;
  user_id: string;
  target_role: string;
  session_name: string;
  status: 'created' | 'in_progress' | 'completed' | 'cancelled';
  current_stage?: string;
  start_time?: string | null;
  end_time?: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface NextQuestion {
  attempt_id: string;
  agent_type: 'technical' | 'followup' | 'scenario' | 'personality';
  question_text: string;
  sequence_number: number;
}

export interface EvaluationSignal {
  type: string;
  score: number;
  notes: string;
}

export interface AnswerResponse {
  attempt_id: string;
  score?: number;
  evaluation_signals?: EvaluationSignal[];
  status?: string;
}

export interface SessionReport {
  session_id: string;
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  attempts: Array<{
    attempt_id: string;
    question_text: string;
    score: number | null;
    agent_type: string;
    answer_text: string | null;
    best_answer: string | null;
    user_answer_comparison: string | null;
    filler_word_count: number | null;
    metrics: Record<string, unknown> | null;
  }>;
  learning_plan: {
    weak_areas: string[];
    recommended_resources: Array<{ title: string; url: string; type: string }>;
  };
}

export interface LearningPlan {
  id: string;
  user_id: string;
  session_id: string | null;
  weak_areas: string[];
  recommended_resources: Array<{ title: string; url: string; type: string }>;
  created_at: string;
}

export interface ProgressData {
  user_id: string;
  sessions: Array<{ session_id: string; date: string; overall_score: number }>;
  trend_metrics: Record<string, number[]>;
}

export interface HealthResponse {
  status: string;
  environment: string;
}

export interface WsQuestionPayload {
  attempt_id: string;
  agent_type: string;
  question_text: string;
}

export interface WsEvaluationPayload {
  attempt_id: string;
  score: number;
  signals: EvaluationSignal[];
}

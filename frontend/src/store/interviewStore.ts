import { create } from 'zustand';
import type { EvaluationSignal, WsQuestionPayload } from '../api/types';

type RecordingMode = 'text' | 'audio';
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface InterviewState {
  currentAttemptId: string | null;
  currentQuestion: WsQuestionPayload | null;
  lastEvaluation: { score: number; signals: EvaluationSignal[]; transcript?: string } | null;
  recordingMode: RecordingMode;
  isRecording: boolean;
  connectionStatus: ConnectionStatus;
  setCurrentQuestion: (q: WsQuestionPayload | null) => void;
  setLastEvaluation: (e: { score: number; signals: EvaluationSignal[]; transcript?: string } | null) => void;
  setRecordingMode: (mode: RecordingMode) => void;
  setIsRecording: (v: boolean) => void;
  setConnectionStatus: (s: ConnectionStatus) => void;
  setCurrentAttemptId: (id: string | null) => void;
  reset: () => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  currentAttemptId: null,
  currentQuestion: null,
  lastEvaluation: null,
  recordingMode: 'text',
  isRecording: false,
  connectionStatus: 'disconnected',

  setCurrentQuestion: (q) => set({ currentQuestion: q, currentAttemptId: q?.attempt_id ?? null }),
  setLastEvaluation: (e) => set({ lastEvaluation: e }),
  setRecordingMode: (mode) => set({ recordingMode: mode }),
  setIsRecording: (v) => set({ isRecording: v }),
  setConnectionStatus: (s) => set({ connectionStatus: s }),
  setCurrentAttemptId: (id) => set({ currentAttemptId: id }),
  reset: () =>
    set({
      currentAttemptId: null,
      currentQuestion: null,
      lastEvaluation: null,
      isRecording: false,
      connectionStatus: 'disconnected',
    }),
}));

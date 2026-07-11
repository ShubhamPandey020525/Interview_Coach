import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getErrorMessage } from '../api/client';
import { completeSession, getSession, submitAnswer } from '../api/sessions';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useInterviewTimer } from '../hooks/useInterviewTimer';
import InterviewerPersona, { type AiInterviewerStatus } from '../components/interview/InterviewerPersona';
import ConnectionStatusBadge from '../components/interview/ConnectionStatusBadge';
import StageProgress from '../components/interview/StageProgress';
import ConversationTimeline, { type TimelineLine } from '../components/interview/ConversationTimeline';
import AudioOnlyPanel from '../components/interview/AudioOnlyPanel';
import { formatQuestionDisplay } from '../utils/speechText';
import {
  MAX_QUESTIONS,
  buildClosingSpeech,
  buildQuestionSpeech,
  buildSkipSpeech,
} from '../utils/interviewScript';

type FlowPhase = 'idle' | 'starting' | 'speaking' | 'listening' | 'submitting' | 'thinking' | 'completed';

const SKIP_ANSWER_TEXT = 'The candidate did not provide an answer within the allotted time.';

export default function InterviewConsolePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const {
    reconnectNow,
    sessionComplete,
    connectionStatus,
    currentQuestion,
    lastEvaluation,
    loadError,
  } = useInterviewSocket(sessionId!);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId,
  });

  const { speak, stop: stopSpeaking, prime: primeSpeech } = useSpeechSynthesis();
  const audio = useAudioRecorder();
  const { formatted: timerFormatted } = useInterviewTimer(connectionStatus === 'connected');

  const [phase, setPhase] = useState<FlowPhase>('idle');
  const [lines, setLines] = useState<TimelineLine[]>([]);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [userTranscript, setUserTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const lastAttemptRef = useRef<string | null>(null);
  const lastSpokenAttemptRef = useRef<string | null>(null);
  const lastEvalRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const attemptRef = useRef<string | null>(null);
  const phaseRef = useRef<FlowPhase>('idle');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const addLine = useCallback((line: Omit<TimelineLine, 'id'>) => {
    setLines((prev) => [...prev, { ...line, id: crypto.randomUUID() }]);
  }, []);

  // --- Manual control handlers ---

  const handleStartInterview = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    primeSpeech();
    audio.ensureMicrophoneAccess().catch(() => {});
    setPhase('starting');
  }, [primeSpeech, audio]);

  const handleStartRecording = useCallback(() => {
    if (phaseRef.current !== 'speaking') return;
    stopSpeaking();
    audio.startRecording().catch(() => {});
    setPhase('listening');
  }, [stopSpeaking, audio]);

  const handleSubmitAnswer = useCallback(async () => {
    const attemptId = attemptRef.current;
    if (!sessionId || !attemptId || submittingRef.current || phaseRef.current !== 'listening') return;

    submittingRef.current = true;
    setPhase('submitting');

    try {
      const blob = audio.audioBlob;
      if (blob) {
        await submitAnswer(sessionId, attemptId, undefined, blob);
      } else {
        await submitAnswer(sessionId, attemptId, SKIP_ANSWER_TEXT);
      }
      addLine({ role: 'candidate', text: userTranscript || 'Answer submitted', meta: blob ? 'Audio' : 'Text' });
      setPhase('thinking');
      audio.reset();
      setUserTranscript('');
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
      setPhase('listening');
    } finally {
      submittingRef.current = false;
    }
  }, [sessionId, userTranscript, audio, addLine]);

  const handleEndInterview = useCallback(async () => {
    stopSpeaking();
    audio.reset();
    if (sessionId) {
      try {
        await completeSession(sessionId);
      } catch {}
      navigate(`/sessions/${sessionId}/report`);
    }
  }, [stopSpeaking, audio, sessionId, navigate]);

  // --- Handle new question ---
  const deliverQuestion = useCallback(
    (attemptId: string, rawText: string, agentType: string, qNum: number) => {
      const displayText = formatQuestionDisplay(rawText);
      const isNewQuestion = attemptId !== lastSpokenAttemptRef.current;
      lastAttemptRef.current = attemptId;

      if (isNewQuestion) {
        lastSpokenAttemptRef.current = attemptId;
        addLine({ role: 'interviewer', text: displayText, meta: agentType });
      }

      attemptRef.current = attemptId;

      // Speak the question
      audio.releaseMicForSpeech();
      const isLast = qNum >= MAX_QUESTIONS;
      const speechText = buildQuestionSpeech(rawText, qNum, isLast);

      speak(speechText, {
        onStart: () => setPhase('speaking'),
        onEnd: () => setPhase('idle'), // Wait for user to press start recording
        onError: () => setPhase('idle'),
      });
    },
    [addLine, speak, audio]
  );

  // Auto-deliver when new question arrives from LLM (after consent)
  useEffect(() => {
    if (!currentQuestion) return;
    if (currentQuestion.attempt_id === lastSpokenAttemptRef.current) return;
    if (phaseRef.current === 'submitting') return;

    // Stop any in-progress recording before speaking the next question
    if (phaseRef.current === 'listening') {
      audio.releaseMicForSpeech();
    }

    questionNumberRef.current += 1;
    setQuestionNumber(questionNumberRef.current);
    deliverQuestion(
      currentQuestion.attempt_id,
      currentQuestion.question_text,
      currentQuestion.agent_type,
      questionNumberRef.current
    );
  }, [currentQuestion, deliverQuestion, audio]);

  useEffect(() => {
    if (!lastEvaluation) return;
    const key = `${lastEvaluation.score}-${lastEvaluation.signals.map((s) => s.notes).join('|')}`;
    if (lastEvalRef.current === key) return;
    lastEvalRef.current = key;
    setPhase('idle'); // Ready for next question, or completion
  }, [lastEvaluation]);

  useEffect(() => {
    if (!sessionComplete || !sessionId) return;
    setPhase('completed');

    const finish = async () => {
      stopSpeaking();
      audio.releaseMicForSpeech();
      speak(buildClosingSpeech(), {
        onEnd: async () => {
          try {
            await completeSession(sessionId);
          } catch {}
          navigate(`/sessions/${sessionId}/report`);
        },
        onError: async () => {
          try {
            await completeSession(sessionId);
          } catch {}
          navigate(`/sessions/${sessionId}/report`);
        },
      });
    };
    finish();
  }, [sessionComplete, navigate, sessionId, stopSpeaking, audio, speak]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      audio.reset();
    };
  }, [stopSpeaking, audio]);

  const displayQuestion = currentQuestion
    ? formatQuestionDisplay(currentQuestion.question_text)
    : null;

  const aiStatus: AiInterviewerStatus =
    phase === 'speaking'
      ? 'speaking'
      : phase === 'listening' && audio.isRecording
        ? 'listening'
        : phase === 'submitting' || phase === 'thinking'
          ? 'thinking'
          : 'idle';

  const aiStatusLabel =
    phase === 'speaking'
      ? 'Asking your question...'
      : phase === 'listening'
        ? 'Listening to your answer...'
        : phase === 'submitting'
          ? 'Submitting your answer...'
          : phase === 'thinking'
            ? 'Evaluating your answer...'
            : phase === 'starting'
              ? 'Starting interview...'
              : 'Ready';

  return (
    <div className="interview-focus -mx-6 -mt-8 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-gradient-to-b from-slate-50 to-teal-50/30 px-3 py-3 md:px-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
        {/* Header */}
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-gray-900">AI Voice Interview</h1>
            <p className="truncate text-xs text-gray-600">{session?.target_role || 'Interview'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded bg-white px-2 py-1 font-mono text-xs text-gray-700 shadow-sm">
              {timerFormatted}
            </span>
            <ConnectionStatusBadge status={connectionStatus} onReconnect={reconnectNow} />
          </div>
        </div>

        {(errorMessage || loadError) && (
          <div className="mb-2 shrink-0 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {errorMessage || loadError}
          </div>
        )}

        {/* Main content */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          {/* Top: Priya + question */}
          <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex gap-4">
              <div className="shrink-0">
                <InterviewerPersona status={aiStatus} statusLabel={aiStatusLabel} compact />
              </div>
              <div className="min-w-0 flex-1">
                <StageProgress
                  currentStage={currentQuestion?.agent_type || null}
                  questionNumber={questionNumber}
                />
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  {displayQuestion ? (
                    <>
                      <span className="mb-1 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium capitalize text-teal-800">
                        {currentQuestion!.agent_type}
                      </span>
                      <p className="text-sm leading-snug text-gray-800">{displayQuestion}</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">
                      {phase === 'starting'
                        ? 'Starting interview...'
                        : 'Press "Start Interview" to begin'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Middle: Voice Answer + Controls */}
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden lg:grid-cols-5">
              <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-3">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <AudioOnlyPanel
                    isRecording={audio.isRecording}
                    isSpeaking={phase === 'speaking'}
                    isProcessing={phase === 'submitting' || phase === 'thinking'}
                    audioLevel={audio.audioLevel}
                    formattedDuration={audio.formattedDuration}
                    permissionDenied={audio.permissionDenied}
                    needsConsent={false}
                    isStarting={phase === 'starting'}
                    onGrantConsent={() => {}}
                  />
                </div>
                {/* Control buttons */}
                <div className="mt-2 flex shrink-0 gap-2 justify-center">
                  {phase === 'idle' && !currentQuestion && (
                    <button
                      onClick={handleStartInterview}
                      className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                      Start Interview
                    </button>
                  )}
                  {phase === 'speaking' && (
                    <>
                      <button
                        onClick={handleStartRecording}
                        className="rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600"
                      >
                        Start Recording Answer
                      </button>
                      <button
                        onClick={() => {
                          stopSpeaking();
                          setPhase('idle');
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Skip Speaking
                      </button>
                    </>
                  )}
                  {phase === 'listening' && (
                    <>
                      <button
                        onClick={handleSubmitAnswer}
                        className="rounded-lg bg-green-500 px-6 py-2 text-sm font-medium text-white hover:bg-green-600"
                        disabled={submittingRef.current}
                      >
                        Submit Answer
                      </button>
                      <button
                        onClick={() => {
                          audio.stopRecording();
                          setPhase('idle');
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {(phase === 'thinking' || phase === 'idle') && currentQuestion && (
                    <p className="text-sm text-gray-600">Waiting for next question...</p>
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-hidden lg:col-span-2">
                <ConversationTimeline lines={lines} compact />
              </div>
            </div>

            {/* Bottom status bar */}
            <div className="shrink-0 mt-2 rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {phase === 'speaking' && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm text-gray-700">AI is speaking...</span>
                    </div>
                  )}
                  {phase === 'listening' && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm text-gray-700">Listening to your answer...</span>
                    </div>
                  )}
                  {phase === 'submitting' && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-sm text-gray-700">Submitting answer...</span>
                    </div>
                  )}
                  {phase === 'thinking' && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
                      <span className="text-sm text-gray-700">Evaluating your answer...</span>
                    </div>
                  )}
                  {phase === 'idle' && !currentQuestion && (
                    <span className="text-sm text-gray-600">Ready to start!</span>
                  )}
                </div>
                <button
                  onClick={handleEndInterview}
                  className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100"
                >
                  End Interview
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

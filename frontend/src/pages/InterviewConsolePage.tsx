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

type FlowPhase = 'consent' | 'speaking' | 'recording' | 'submitting' | 'thinking' | 'idle';

const SKIP_ANSWER_TEXT =
  'The candidate did not provide an answer within the allotted time.';

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

  const [phase, setPhase] = useState<FlowPhase>('consent');
  const [consentGiven, setConsentGiven] = useState(false);
  const [autoStarting, setAutoStarting] = useState(true);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<TimelineLine[]>([]);
  const [questionNumber, setQuestionNumber] = useState(0);

  const lastAttemptRef = useRef<string | null>(null);
  const lastSpokenAttemptRef = useRef<string | null>(null);
  const lastEvalRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const attemptRef = useRef<string | null>(null);
  const phaseRef = useRef<FlowPhase>('consent');
  const ttsUnlockedRef = useRef(false);
  const closingSpokenRef = useRef(false);
  const questionNumberRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Auto-start: unlock TTS on page load; mic is acquired only when recording starts.
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setAutoStarting(true);
      primeSpeech();
      setConsentGiven(true);
      ttsUnlockedRef.current = true;
      if (!cancelled) setAutoStarting(false);
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [sessionId, primeSpeech]);

  const addLine = useCallback((line: Omit<TimelineLine, 'id'>) => {
    setLines((prev) => [...prev, { ...line, id: crypto.randomUUID() }]);
  }, []);

  const submitSkipAnswer = useCallback(async () => {
    const attemptId = attemptRef.current;
    if (!sessionId || !attemptId || submittingRef.current) return;

    submittingRef.current = true;
    setPhase('submitting');
    addLine({ role: 'candidate', text: '(No response — moving on)', meta: 'Skipped' });

    try {
      await submitAnswer(sessionId, attemptId, SKIP_ANSWER_TEXT);
      setPhase('thinking');
      audio.reset();
    } catch (err) {
      setError(getErrorMessage(err));
      setPhase('idle');
    } finally {
      submittingRef.current = false;
    }
  }, [sessionId, addLine, audio]);

  const submitAudioAnswer = useCallback(
    async (blob: Blob) => {
      const attemptId = attemptRef.current;
      if (!sessionId || !attemptId || submittingRef.current) return;

      submittingRef.current = true;
      setPhase('submitting');
      addLine({ role: 'candidate', text: 'Voice answer recorded', meta: 'Audio' });

      try {
        await submitAnswer(sessionId, attemptId, undefined, blob);
        setPhase('thinking');
        audio.reset();
      } catch (err) {
        setError(getErrorMessage(err));
        setPhase('idle');
      } finally {
        submittingRef.current = false;
      }
    },
    [sessionId, addLine, audio]
  );

  const startAutoRecording = useCallback(async () => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'submitting') return;

    try {
      await audio.startRecording({
        onComplete: (blob) => {
          void submitAudioAnswer(blob);
        },
        onNoSpeech: () => {
          audio.releaseMicForSpeech();
          speak(buildSkipSpeech(), {
            onEnd: () => {
              void submitSkipAnswer();
            },
            onError: () => {
              void submitSkipAnswer();
            },
          });
        },
        onEmptyRecording: () => {
          void submitSkipAnswer();
        },
        noSpeechTimeoutMs: 5000,
        silenceDurationMs: 2000,
        silenceThreshold: 10,
        minDurationMs: 800,
        maxDurationMs: 120000,
      });
      setPhase('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone unavailable');
      setPhase('idle');
    }
  }, [audio, submitAudioAnswer, submitSkipAnswer, speak]);

  const speakThenRecord = useCallback(
    (speechText: string, attemptId: string) => {
      attemptRef.current = attemptId;
      setPhase('speaking');

      // Release mic + close AudioContext so TTS is not blocked (Chrome/Windows).
      audio.releaseMicForSpeech();

      speak(speechText, {
        onStart: () => {
          ttsUnlockedRef.current = true;
          setPhase('speaking');
        },
        onEnd: () => {
          window.setTimeout(() => {
            void startAutoRecording();
          }, 500);
        },
        onError: () => {
          window.setTimeout(() => {
            void startAutoRecording();
          }, 500);
        },
      });
    },
    [speak, startAutoRecording, audio]
  );

  const deliverQuestion = useCallback(
    (attemptId: string, rawText: string, agentType: string, qNum: number) => {
      const displayText = formatQuestionDisplay(rawText);
      const isNewQuestion = attemptId !== lastSpokenAttemptRef.current;
      lastAttemptRef.current = attemptId;

      if (isNewQuestion) {
        lastSpokenAttemptRef.current = attemptId;
        addLine({ role: 'interviewer', text: displayText, meta: agentType });
      }

      const isLast = qNum >= MAX_QUESTIONS;
      const speechText = buildQuestionSpeech(rawText, qNum, isLast);
      speakThenRecord(speechText, attemptId);
    },
    [addLine, speakThenRecord]
  );

  // Auto-deliver when new question arrives from LLM (after consent).
  useEffect(() => {
    if (!consentGiven || !currentQuestion) return;
    if (currentQuestion.attempt_id === lastSpokenAttemptRef.current) return;
    if (phaseRef.current === 'submitting') return;

    // Stop any in-progress recording before speaking the next question.
    if (phaseRef.current === 'recording') {
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
  }, [currentQuestion, consentGiven, deliverQuestion, audio]);

  useEffect(() => {
    if (!lastEvaluation) return;
    const key = `${lastEvaluation.score}-${lastEvaluation.signals.map((s) => s.notes).join('|')}`;
    if (lastEvalRef.current === key) return;
    lastEvalRef.current = key;
    setPhase('thinking');
  }, [lastEvaluation]);

  useEffect(() => {
    if (!sessionComplete || !sessionId || closingSpokenRef.current) return;
    closingSpokenRef.current = true;

    const finish = async () => {
      stopSpeaking();
      audio.releaseMicForSpeech();
      speak(buildClosingSpeech(), {
        onEnd: async () => {
          try {
            await completeSession(sessionId);
          } catch {
            // already completed
          }
          navigate(`/sessions/${sessionId}/report`);
        },
        onError: async () => {
          try {
            await completeSession(sessionId);
          } catch {
            // already completed
          }
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

  const handleGrantConsent = () => {
    setError('');
    primeSpeech();
    setConsentGiven(true);
    ttsUnlockedRef.current = true;
    void audio.ensureMicrophoneAccess().catch(() => {
      setError('Allow microphone access to continue.');
    });
  };

  const displayQuestion = currentQuestion
    ? formatQuestionDisplay(currentQuestion.question_text)
    : null;

  const aiStatus: AiInterviewerStatus =
    phase === 'speaking'
      ? 'speaking'
      : phase === 'recording' && audio.isRecording
      ? 'listening'
      : phase === 'submitting' || phase === 'thinking'
      ? 'thinking'
      : 'idle';

  const aiStatusLabel =
    phase === 'speaking'
      ? 'Asking your question…'
      : phase === 'recording' && audio.isRecording
      ? 'Listening — speak your answer'
      : phase === 'submitting' || phase === 'thinking'
      ? 'Evaluating…'
      : phase === 'consent' || autoStarting
      ? 'Starting interview…'
      : 'Preparing…';

  return (
    <div className="interview-focus -mx-6 -mt-8 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-gradient-to-b from-slate-50 to-teal-50/30 px-3 py-3 md:px-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
        {/* Header — compact */}
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

        {(error || loadError) && (
          <div className="mb-2 shrink-0 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {error || loadError}
          </div>
        )}

        {/* Main content — fills remaining height, no page scroll */}
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
                      <p className="line-clamp-3 text-sm leading-snug text-gray-800">{displayQuestion}</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">
                      {connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
                        ? 'Connecting…'
                        : 'Waiting for question from AI…'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: Voice Answer + Transcript — fills rest */}
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
                  isStarting={autoStarting}
                  onGrantConsent={handleGrantConsent}
                />
              </div>
              <button
                onClick={() => {
                  stopSpeaking();
                  audio.reset();
                  void completeSession(sessionId!).then(() =>
                    navigate(`/sessions/${sessionId}/report`)
                  );
                }}
                className="mt-2 shrink-0 self-end rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                End Interview
              </button>
            </div>

            <div className="min-h-0 overflow-hidden lg:col-span-2">
              <ConversationTimeline lines={lines} compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

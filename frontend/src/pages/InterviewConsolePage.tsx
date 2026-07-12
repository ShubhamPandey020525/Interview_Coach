import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getErrorMessage } from '../api/client';
import { completeSession, getSession, submitAnswer } from '../api/sessions';
import { useInterviewSocket } from '../hooks/useInterviewSocket';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
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
} from '../utils/interviewScript';

type FlowPhase = 'idle' | 'starting' | 'speaking' | 'listening' | 'submitting' | 'thinking' | 'completed';

const SKIP_ANSWER_TEXT = 'No answer response was provided.';

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
    requestNextQuestion,
  } = useInterviewSocket(sessionId!);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId,
  });

  const { speak, stop: stopSpeaking, prime: primeSpeech } = useSpeechSynthesis();
  const audio = useAudioRecorder();
  const recognition = useSpeechRecognition();
  const { formatted: timerFormatted } = useInterviewTimer(connectionStatus === 'connected');

  const [phase, setPhase] = useState<FlowPhase>('idle');
  const [lines, setLines] = useState<TimelineLine[]>([]);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [userTranscript, setUserTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLastQuestionAnswered, setIsLastQuestionAnswered] = useState(false);

  const lastAttemptRef = useRef<string | null>(null);
  const lastSpokenAttemptRef = useRef<string | null>(null);
  const lastEvalRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const attemptRef = useRef<string | null>(null);
  const phaseRef = useRef<FlowPhase>('idle');
  const questionNumberRef = useRef(0);

  const submitPendingRef = useRef(false);
  const pendingAnswerTextRef = useRef('');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Sync speech recognition liveText to userTranscript editable state while listening
  useEffect(() => {
    if (phase === 'listening') {
      setUserTranscript(recognition.liveText);
    }
  }, [recognition.liveText, phase]);

  const addLine = useCallback((line: Omit<TimelineLine, 'id'>) => {
    setLines((prev) => [...prev, { ...line, id: crypto.randomUUID() }]);
  }, []);

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

  // --- Manual control handlers ---

  const handleStartInterview = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    primeSpeech();
    setPhase('starting');

    if (currentQuestion) {
      questionNumberRef.current = 1;
      setQuestionNumber(1);
      deliverQuestion(
        currentQuestion.attempt_id,
        currentQuestion.question_text,
        currentQuestion.agent_type,
        1
      );
    }
  }, [primeSpeech, currentQuestion, deliverQuestion]);

  const handleStartRecording = useCallback(() => {
    if (phaseRef.current !== 'speaking' && phaseRef.current !== 'idle') return;
    stopSpeaking();
    // Start audio recording and live speech recognition (if supported).
    audio.startRecording().catch(() => {});
    try {
      recognition.resetTranscript();
      recognition.startListening();
    } catch {
      // ignore if browser does not support Web Speech API
    }
    setPhase('listening');
  }, [stopSpeaking, audio, recognition]);

  const performSubmit = useCallback(async (blob: Blob | null) => {
    const attemptId = attemptRef.current;
    if (!sessionId || !attemptId) return;

    try {
      const answerText = pendingAnswerTextRef.current;
      if (blob) {
        await submitAnswer(sessionId, attemptId, answerText, blob);
      } else if (answerText) {
        await submitAnswer(sessionId, attemptId, answerText);
      } else {
        await submitAnswer(sessionId, attemptId, SKIP_ANSWER_TEXT);
      }
      addLine({ role: 'candidate', text: answerText || 'Answer submitted', meta: blob ? 'Audio' : 'Text' });
      
      audio.reset();
      setUserTranscript('');

      if (questionNumberRef.current >= MAX_QUESTIONS) {
        setPhase('idle');
        setIsLastQuestionAnswered(true);
      } else {
        setPhase('thinking');
        await requestNextQuestion();
      }
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
      setPhase('listening');
    } finally {
      submittingRef.current = false;
      submitPendingRef.current = false;
    }
  }, [sessionId, addLine, audio, requestNextQuestion]);

  // Effect to wait for audioBlob to be ready if submit was clicked during recording
  useEffect(() => {
    if (submitPendingRef.current && audio.audioBlob) {
      void performSubmit(audio.audioBlob);
    }
  }, [audio.audioBlob, performSubmit]);

  const handleSubmitAnswer = useCallback(async () => {
    const attemptId = attemptRef.current;
    const currentPhase = phaseRef.current;
    const isValidPhase = currentPhase === 'listening' || currentPhase === 'idle' || currentPhase === 'speaking';
    
    if (!sessionId || !attemptId || submittingRef.current || !isValidPhase) return;

    submittingRef.current = true;
    setPhase('submitting');

    const answerText = userTranscript || recognition.liveText || '';
    pendingAnswerTextRef.current = answerText;

    if (audio.isRecording) {
      submitPendingRef.current = true;
      audio.stopRecording();
      try {
        recognition.stopListening();
      } catch {}
      
      // Safety timeout: if blob doesn't arrive in 800ms, submit text-only
      window.setTimeout(() => {
        if (submitPendingRef.current) {
          void performSubmit(null);
        }
      }, 800);
    } else {
      try {
        recognition.stopListening();
      } catch {}
      void performSubmit(null);
    }
  }, [sessionId, userTranscript, audio, recognition, performSubmit]);

  const handleEndInterview = useCallback(async () => {
    stopSpeaking();
    try {
      recognition.stopListening();
    } catch {}
    audio.reset();
    if (sessionId) {
      try {
        await completeSession(sessionId);
      } catch {}
      navigate(`/sessions/${sessionId}/report`);
    }
  }, [stopSpeaking, audio, sessionId, navigate, recognition]);

  const handleGenerateReport = useCallback(async () => {
    setPhase('completed');
    stopSpeaking();
    audio.releaseMicForSpeech();
    speak(buildClosingSpeech(), {
      onEnd: async () => {
        try {
          await completeSession(sessionId!);
        } catch {}
        navigate(`/sessions/${sessionId}/report`);
      },
      onError: async () => {
        try {
          await completeSession(sessionId!);
        } catch {}
        navigate(`/sessions/${sessionId}/report`);
      },
    });
  }, [stopSpeaking, audio, sessionId, navigate, speak]);



  // Auto-deliver when new question arrives from LLM (after consent)
  useEffect(() => {
    if (!currentQuestion) return;
    if (currentQuestion.attempt_id === lastSpokenAttemptRef.current) return;
    if (phaseRef.current === 'submitting') return;
    if (phaseRef.current === 'idle') return; // Do not speak automatically if interview has not started

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
      try {
        recognition.stopListening();
      } catch {}
      audio.reset();
    };
  }, [stopSpeaking, audio, recognition]);

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
                    userTranscript={userTranscript}
                    onTranscriptChange={setUserTranscript}
                    speechLang={recognition.lang}
                    onSpeechLangChange={recognition.setLang}
                  />
                </div>
                {/* Control buttons */}
                <div className="mt-2 flex shrink-0 gap-2 justify-center">
                  {phase === 'idle' && !lastSpokenAttemptRef.current && (
                    <button
                      onClick={handleStartInterview}
                      className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white hover:opacity-90 shadow-sm"
                    >
                      Start Interview
                    </button>
                  )}

                  {phase === 'idle' && lastSpokenAttemptRef.current && !sessionComplete && !isLastQuestionAnswered && (
                    <button
                      onClick={async () => {
                        setPhase('thinking');
                        await requestNextQuestion();
                      }}
                      className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700 shadow-sm transition-colors duration-150"
                    >
                      Next Question
                    </button>
                  )}

                  {phase === 'idle' && isLastQuestionAnswered && !sessionComplete && (
                    <button
                      onClick={handleGenerateReport}
                      className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm transition-all animate-pulse"
                    >
                      Generate Report
                    </button>
                  )}
                  
                  {/* Show recording button if a question is active but we are not recording/submitting/thinking */}
                  {(phase === 'speaking' || (phase === 'idle' && currentQuestion)) && (
                    <>
                      <button
                        onClick={handleStartRecording}
                        className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors duration-150"
                      >
                        Start Recording Answer
                      </button>

                      {/* Allow manual submit of typed answers or edits */}
                      {userTranscript.trim().length > 0 && (
                        <button
                          onClick={handleSubmitAnswer}
                          className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 shadow-sm transition-colors duration-150"
                          disabled={submittingRef.current}
                        >
                          Submit Answer
                        </button>
                      )}

                      {phase === 'speaking' && (
                        <button
                          onClick={() => {
                            stopSpeaking();
                            setPhase('idle');
                          }}
                          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Skip Speaking
                        </button>
                      )}
                    </>
                  )}

                  {phase === 'listening' && (
                    <>
                      <button
                        onClick={handleSubmitAnswer}
                        className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 shadow-sm transition-colors duration-150"
                        disabled={submittingRef.current}
                      >
                        Submit Answer
                      </button>
                      <button
                        onClick={() => {
                          audio.stopRecording();
                          try {
                            recognition.stopListening();
                          } catch {}
                          setPhase('idle');
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {(phase === 'thinking' || phase === 'submitting') && (
                    <p className="text-sm text-gray-600 animate-pulse font-medium">Evaluating your answer, please wait...</p>
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

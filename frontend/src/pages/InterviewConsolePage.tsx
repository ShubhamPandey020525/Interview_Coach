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
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const stopAudioPlayback = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    stopSpeaking();
  }, [stopSpeaking]);

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
    (attemptId: string, rawText: string, agentType: string, _qNum: number, audioUrl?: string | null) => {
      const displayText = formatQuestionDisplay(rawText);
      const isNewQuestion = attemptId !== lastSpokenAttemptRef.current;
      lastAttemptRef.current = attemptId;

      if (isNewQuestion) {
        lastSpokenAttemptRef.current = attemptId;
        addLine({ role: 'interviewer', text: displayText, meta: agentType });
      }

      attemptRef.current = attemptId;

      // Stop any existing audio
      stopAudioPlayback();
      audio.releaseMicForSpeech();

      const speechText = formatQuestionDisplay(rawText);
      const targetPath = audioUrl || `/media/tts/${attemptId}.mp3`;
      const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
      const backendOrigin = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
      const fullBackendUrl = `${backendOrigin.replace(/\/$/, '')}${cleanPath}`;

      const fallbackToSpeech = () => {
        speak(speechText, {
          onStart: () => setPhase('speaking'),
          onEnd: () => setPhase('idle'),
          onError: () => setPhase('idle'),
        });
      };

      // Try full backend URL first for direct file access
      const audioEl = new Audio(fullBackendUrl);
      audioElementRef.current = audioEl;

      audioEl.onplay = () => setPhase('speaking');
      audioEl.onended = () => {
        setPhase('idle');
        audioElementRef.current = null;
      };
      audioEl.onerror = () => {
        // Fallback to relative cleanPath or Web Speech API
        const retryEl = new Audio(cleanPath);
        audioElementRef.current = retryEl;
        retryEl.onplay = () => setPhase('speaking');
        retryEl.onended = () => {
          setPhase('idle');
          audioElementRef.current = null;
        };
        retryEl.onerror = () => {
          audioElementRef.current = null;
          fallbackToSpeech();
        };
        retryEl.play().catch(() => fallbackToSpeech());
      };

      setPhase('speaking');
      audioEl.play().catch(() => {
        fallbackToSpeech();
      });
    },
    [addLine, audio, stopAudioPlayback, speak]
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
        1,
        currentQuestion.audio_url
      );
    }
  }, [primeSpeech, currentQuestion, deliverQuestion]);

  const handleReadQuestion = useCallback(() => {
    if (!currentQuestion) return;
    primeSpeech();
    deliverQuestion(
      currentQuestion.attempt_id,
      currentQuestion.question_text,
      currentQuestion.agent_type,
      questionNumberRef.current || 1,
      currentQuestion.audio_url
    );
  }, [currentQuestion, deliverQuestion, primeSpeech]);


  const handleStartRecording = useCallback(() => {
    if (phaseRef.current !== 'speaking' && phaseRef.current !== 'idle') return;
    stopAudioPlayback();
    // Start audio recording and live speech recognition (if supported).
    audio.startRecording().catch(() => {});
    try {
      recognition.resetTranscript();
      recognition.startListening();
    } catch {
      // ignore if browser does not support Web Speech API
    }
    setPhase('listening');
  }, [stopAudioPlayback, audio, recognition]);


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
        setPhase('idle');
      }
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
      setPhase('listening');
    } finally {
      submittingRef.current = false;
      submitPendingRef.current = false;
    }
  }, [sessionId, addLine, audio]);

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
    stopAudioPlayback();
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
  }, [stopAudioPlayback, audio, sessionId, navigate, recognition]);

  const handleGenerateReport = useCallback(async () => {
    setPhase('completed');
    stopAudioPlayback();
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
  }, [stopAudioPlayback, audio, sessionId, navigate, speak]);



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
      questionNumberRef.current,
      currentQuestion.audio_url
    );
  }, [currentQuestion, deliverQuestion, audio]);

  useEffect(() => {
    if (!lastEvaluation) return;

    if (lastEvaluation.transcript) {
      setLines((prev) => {
        const nextLines = [...prev];
        for (let i = nextLines.length - 1; i >= 0; i--) {
          if (nextLines[i].role === 'candidate') {
            nextLines[i] = {
              ...nextLines[i],
              text: lastEvaluation.transcript || 'No speech captured.'

            };
            break;
          }
        }
        return nextLines;
      });
    }

    const key = `${lastEvaluation.score}-${lastEvaluation.signals.map((s) => s.notes).join('|')}-${lastEvaluation.transcript || ''}`;
    if (lastEvalRef.current === key) return;
    lastEvalRef.current = key;
    setPhase('idle'); // Ready for next question, or completion
  }, [lastEvaluation]);

  useEffect(() => {
    if (!sessionComplete || !sessionId) return;
    setPhase('completed');

    const finish = async () => {
      stopAudioPlayback();
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
  }, [sessionComplete, navigate, sessionId, stopAudioPlayback, audio, speak]);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
      try {
        recognition.stopListening();
      } catch {}
      audio.reset();
    };
  }, [stopAudioPlayback, audio, recognition]);


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
    <div className="interview-focus flex-1 w-full h-full flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-50 text-slate-800 p-4 md:p-6 box-border">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
        {/* Header */}
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold text-slate-900 tracking-tight">AI Voice Interview Studio</h1>
            <p className="truncate text-xs text-teal-700 font-bold">{session?.target_role || 'Mock Interview'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-xl border border-slate-200 bg-white px-3 py-1 font-mono text-xs font-bold text-teal-800 shadow-xs">
              ⏱️ {timerFormatted}
            </span>
            <ConnectionStatusBadge status={connectionStatus} onReconnect={reconnectNow} />
          </div>
        </div>

        {(errorMessage || loadError) && (
          <div className="mb-2 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 font-semibold shadow-xs">
            ⚠️ {errorMessage || loadError}
          </div>
        )}

        {/* Main content */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          {/* Top: Persona + question */}
          <div className="shrink-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl shadow-slate-200/50 backdrop-blur-md">
            <div className="flex gap-4">
              <div className="shrink-0">
                <InterviewerPersona status={aiStatus} statusLabel={aiStatusLabel} compact />
              </div>
              <div className="min-w-0 flex-1">
                <StageProgress
                  currentStage={currentQuestion?.agent_type || null}
                  questionNumber={questionNumber}
                />
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 shadow-inner">
                  {displayQuestion ? (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="inline-block rounded-full bg-teal-100 border border-teal-300 px-2.5 py-0.5 text-[10px] font-bold capitalize text-teal-900">
                          {currentQuestion!.agent_type}
                        </span>
                        <button
                          onClick={handleReadQuestion}
                          className="flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-50 hover:bg-teal-100 px-3 py-1 text-xs font-extrabold text-teal-800 shadow-xs transition-all active:scale-95 cursor-pointer"
                          title="Click to play/replay question audio"
                        >
                          <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                          <span>{phase === 'speaking' ? 'Playing Audio...' : 'Listen Question 🔊'}</span>
                        </button>
                      </div>
                      <p className="text-sm font-medium leading-relaxed text-slate-800">{displayQuestion}</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">
                      {phase === 'starting'
                        ? 'Starting interview studio...'
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
                <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50">
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
                      className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-teal-600/20 transition-all transform active:scale-95 cursor-pointer"
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
                      className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-teal-600/20 transition-all active:scale-95 cursor-pointer"
                    >
                      Next Question ➔
                    </button>
                  )}

                  {phase === 'idle' && isLastQuestionAnswered && !sessionComplete && (
                    <button
                      onClick={handleGenerateReport}
                      className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-xs font-black text-white shadow-xl shadow-emerald-600/25 hover:scale-105 transition-all cursor-pointer"
                    >
                      Finish Interview & View Report 🏆
                    </button>
                  )}
                  
                  {/* Show recording button if a question is active but we are not recording/submitting/thinking */}
                  {(phase === 'speaking' || (phase === 'idle' && currentQuestion)) && !isLastQuestionAnswered && (
                    <>
                      <button
                        onClick={handleStartRecording}
                        className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-blue-600/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                      >
                        <span>🎙️ Start Recording Answer</span>
                      </button>

                      {/* Allow manual submit of typed answers or edits */}
                      {userTranscript.trim().length > 0 && (
                        <button
                          onClick={handleSubmitAnswer}
                          className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
                          disabled={submittingRef.current}
                        >
                          Submit Answer ➔
                        </button>
                      )}

                      {phase === 'speaking' && (
                        <button
                          onClick={() => {
                            stopAudioPlayback();
                            setPhase('idle');
                          }}
                          className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-xs"
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
                        className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
                        disabled={submittingRef.current}
                      >
                        Submit Answer ➔
                      </button>
                      <button
                        onClick={() => {
                          audio.stopRecording();
                          try {
                            recognition.stopListening();
                          } catch {}
                          setPhase('idle');
                        }}
                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-xs"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {(phase === 'thinking' || phase === 'submitting') && (
                    <p className="text-xs text-teal-700 font-extrabold tracking-wide">Evaluating your answer with AI agents, please wait...</p>
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-hidden lg:col-span-2 rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50">
                <ConversationTimeline lines={lines} compact />
              </div>
            </div>

            {/* Bottom status bar */}
            <div className="shrink-0 mt-1 rounded-xl border border-slate-200/90 bg-white p-3 shadow-md shadow-slate-200/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold">
                  {phase === 'speaking' && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                      <span className="text-teal-800">AI Interviewer is speaking...</span>
                    </div>
                  )}
                  {phase === 'listening' && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-emerald-800">Listening to your answer...</span>
                    </div>
                  )}
                  {phase === 'submitting' && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="text-blue-800">Transcribing & Submitting answer...</span>
                    </div>
                  )}
                  {phase === 'thinking' && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-amber-800">AI Agents evaluating technical accuracy...</span>
                    </div>
                  )}
                  {phase === 'idle' && !currentQuestion && (
                    <span className="text-slate-500">Ready to start mock round!</span>
                  )}
                </div>
                <button
                  onClick={handleEndInterview}
                  className="rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1 text-xs font-bold text-red-700 transition-all cursor-pointer shadow-xs"
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

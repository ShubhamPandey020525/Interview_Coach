import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../api/client';
import { getNextQuestion } from '../api/sessions';
import { useAuthStore } from '../store/authStore';
import { useInterviewStore } from '../store/interviewStore';
import type { WsEvaluationPayload, WsQuestionPayload } from '../api/types';

const WS_BASE = import.meta.env.VITE_WS_BASE_URL || 'ws://127.0.0.1:8000';

export function useInterviewSocket(sessionId: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const shouldReconnect = useRef(true);
  const pingRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  const [closeCode, setCloseCode] = useState<number | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    setCurrentQuestion,
    setLastEvaluation,
    setConnectionStatus,
    connectionStatus,
    currentQuestion,
    lastEvaluation,
  } = useInterviewStore();

  const applyQuestion = useCallback(
    (payload: WsQuestionPayload) => {
      setCurrentQuestion(payload);
      setLoadError(null);
    },
    [setCurrentQuestion]
  );

  const fetchQuestionViaRest = useCallback(async () => {
    if (!sessionId) return null;
    try {
      const q = await getNextQuestion(sessionId);
      const payload: WsQuestionPayload = {
        attempt_id: q.attempt_id,
        agent_type: q.agent_type,
        question_text: q.question_text,
        audio_url: q.audio_url,
      };

      applyQuestion(payload);
      return payload;
    } catch (err) {
      setLoadError(getErrorMessage(err));
      return null;
    }
  }, [sessionId, applyQuestion]);

  const connectRef = useRef<() => void>(() => {});

  connectRef.current = () => {
    if (!accessToken || !sessionId) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus('connecting');
    const ws = new WebSocket(`${WS_BASE}/ws/sessions/${sessionId}?token=${accessToken}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      setCloseCode(null);
      reconnectAttempt.current = 0;
      pingRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'question') {
        setLastEvaluation(null);
        applyQuestion(msg.payload as WsQuestionPayload);
      } else if (msg.type === 'evaluation') {
        const payload = msg.payload as WsEvaluationPayload;
        setLastEvaluation({ score: payload.score, signals: payload.signals, transcript: payload.transcript });
      } else if (msg.type === 'session_complete') {
        setSessionComplete(true);
      }
    };

    ws.onclose = (event) => {
      setCloseCode(event.code);
      if (pingRef.current) {
        window.clearInterval(pingRef.current);
        pingRef.current = null;
      }
      if (!shouldReconnect.current || event.code === 4401) {
        setConnectionStatus('disconnected');
        return;
      }
      if (reconnectAttempt.current < 8) {
        setConnectionStatus('reconnecting');
        const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 8000);
        reconnectAttempt.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => connectRef.current(), delay);
      } else {
        setConnectionStatus('disconnected');
      }
    };

    ws.onerror = () => ws.close();
  };

  useEffect(() => {
    if (!accessToken || !sessionId) return;

    useInterviewStore.getState().reset();
    setSessionComplete(false);
    setLoadError(null);
    shouldReconnect.current = true;
    reconnectAttempt.current = 0;
    connectRef.current();

    const fallbackTimer = window.setTimeout(() => {
      if (!useInterviewStore.getState().currentQuestion) {
        void fetchQuestionViaRest();
      }
    }, 1500);

    pollRef.current = window.setInterval(() => {
      if (
        useInterviewStore.getState().connectionStatus === 'connected' &&
        !useInterviewStore.getState().currentQuestion
      ) {
        void fetchQuestionViaRest();
      }
    }, 5000);

    return () => {
      shouldReconnect.current = false;
      window.clearTimeout(fallbackTimer);
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (pingRef.current) window.clearInterval(pingRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      useInterviewStore.getState().reset();
    };
  }, [accessToken, sessionId, fetchQuestionViaRest]);

  const reconnectNow = useCallback(() => {
    reconnectAttempt.current = 0;
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }
    connectRef.current();
    void fetchQuestionViaRest();
  }, [fetchQuestionViaRest]);

  const sendAnswer = useCallback((attemptId: string, text: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'answer', payload: { attempt_id: attemptId, text } })
      );
    }
  }, []);

  const requestNextQuestion = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'next_question' }));
      return;
    }
    return fetchQuestionViaRest();
  }, [fetchQuestionViaRest]);

  return {
    sendAnswer,
    reconnectNow,
    requestNextQuestion,
    closeCode,
    sessionComplete,
    connectionStatus,
    currentQuestion,
    lastEvaluation,
    loadError,
  };
}

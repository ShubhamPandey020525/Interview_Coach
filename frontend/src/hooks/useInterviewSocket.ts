import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../api/client';
import { getNextQuestion } from '../api/sessions';
import { useAuthStore } from '../store/authStore';
import { useInterviewStore } from '../store/interviewStore';
import type { WsEvaluationPayload, WsQuestionPayload } from '../api/types';

const IS_EDGE = /edg\//i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');

function normalizeWsBase(): string {
  const env = (import.meta as any).env?.VITE_WS_BASE_URL;
  if (env) return env.endsWith('/') ? env.slice(0, -1) : env;
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  return apiBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:').replace(/\/$/, '');
}

function isLikelyClosed(code: number | null, ready: number): boolean {
  if (code === 1000 || code === 1001 || code === 1006 || code === 1011) return true;
  if (ready === 2 || ready === 3) return true;
  return false;
}

export function useInterviewSocket(sessionId: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const shouldReconnect = useRef(true);
  const pingRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const deadCheckRef = useRef<number | null>(null);
  const lastMsgAtRef = useRef<number>(Date.now());
  const msgIdRef = useRef(0);

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
        sequence_number: q.sequence_number,
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

    const prev = wsRef.current;
    if (prev) {
      try {
        prev.onopen = null;
        prev.onmessage = null;
        prev.onerror = null;
        prev.onclose = null;
        if (!isLikelyClosed(closeCode, prev.readyState)) {
          try { prev.close(1000, 'reconnect'); } catch {}
        }
      } catch {}
      wsRef.current = null;
    }

    setConnectionStatus('connecting');
    const WS_BASE = normalizeWsBase();
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_BASE}/ws/sessions/${sessionId}?token=${encodeURIComponent(accessToken)}`);
    } catch {
      try {
        ws = new WebSocket(`${WS_BASE}/ws/sessions/${sessionId}?token=${encodeURIComponent(accessToken)}`);
      } catch (e) {
        setLoadError('Could not open voice connection. Try refreshing the page.');
        setConnectionStatus('disconnected');
        return;
      }
    }
    wsRef.current = ws;
    lastMsgAtRef.current = Date.now();

    const clearAllTimersForCurrent = () => {
      if (pingRef.current) {
        try { window.clearInterval(pingRef.current); } catch {}
        pingRef.current = null;
      }
      if (deadCheckRef.current) {
        try { window.clearInterval(deadCheckRef.current); } catch {}
        deadCheckRef.current = null;
      }
    };

    ws.onopen = () => {
      setConnectionStatus('connected');
      setCloseCode(null);
      reconnectAttempt.current = 0;
      lastMsgAtRef.current = Date.now();

      clearAllTimersForCurrent();

      const pingInterval = IS_EDGE ? 15000 : 20000;
      pingRef.current = window.setInterval(() => {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            msgIdRef.current++;
            ws.send(JSON.stringify({ type: 'ping', id: msgIdRef.current }));
          }
        } catch {}
      }, pingInterval);

      const deadThreshold = IS_EDGE ? 40000 : 50000;
      const deadForce = IS_EDGE ? 55000 : 65000;
      deadCheckRef.current = window.setInterval(() => {
        try {
          const age = Date.now() - lastMsgAtRef.current;
          if (age > deadThreshold && ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping', id: ++msgIdRef.current }));
            } catch {}
            const age2 = Date.now() - lastMsgAtRef.current;
            if (age2 > deadForce) {
              shouldReconnect.current = true;
              try { ws.close(1000, 'stale'); } catch {}
            }
          }
        } catch {}
      }, IS_EDGE ? 8000 : 10000);
    };

    ws.onmessage = (event) => {
      lastMsgAtRef.current = Date.now();
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'question') {
          setLastEvaluation(null);
          applyQuestion(msg.payload as WsQuestionPayload);
        } else if (msg.type === 'evaluation') {
          const payload = msg.payload as WsEvaluationPayload;
          setLastEvaluation({
            score: payload.score,
            question_score: payload.question_score ?? payload.score,
            signals: payload.signals,
            transcript: payload.transcript,
            metrics: payload.metrics,
          });
        } else if (msg.type === 'session_complete') {
          setSessionComplete(true);
        } else if (msg.type === 'pong') {
          lastMsgAtRef.current = Date.now();
        } else if (msg.type === 'error') {
          const code = msg.payload?.code;
          const message = msg.payload?.message || 'An error occurred.';
          setLoadError(message);
          if (code === 'SESSION_EXPIRED') {
            shouldReconnect.current = false;
            setConnectionStatus('disconnected');
          }
        }
      } catch {
      }
    };

    ws.onclose = (event) => {
      clearAllTimersForCurrent();
      setCloseCode(event.code);
      if (!shouldReconnect.current || event.code === 4401 || event.code === 4000) {
        setConnectionStatus('disconnected');
        return;
      }
      if (reconnectAttempt.current < 12) {
        setConnectionStatus('reconnecting');
        const attempt = reconnectAttempt.current;
        const baseDelay = Math.min(1000 * 2 ** Math.min(attempt, 4), 5000);
        const jitter = Math.floor(Math.random() * (IS_EDGE ? 800 : 500));
        const delay = attempt === 0 ? (IS_EDGE ? 200 : 150) : baseDelay + jitter;
        reconnectAttempt.current = attempt + 1;
        reconnectTimerRef.current = window.setTimeout(() => connectRef.current(), delay);
      } else {
        setConnectionStatus('disconnected');
        setLoadError('Connection lost. Try refreshing or reconnect manually.');
      }
    };

    ws.onerror = () => {
      try {
        if (wsRef.current === ws) {
          try { ws.close(1000, 'error'); } catch {}
        }
      } catch {}
    };
  };

  useEffect(() => {
    if (!accessToken || !sessionId) return;

    useInterviewStore.getState().reset();
    setSessionComplete(false);
    setLoadError(null);
    shouldReconnect.current = true;
    reconnectAttempt.current = 0;
    connectRef.current();

    const fallbackDelay = IS_EDGE ? 800 : 1200;
    const fallbackTimer = window.setTimeout(() => {
      if (!useInterviewStore.getState().currentQuestion) {
        void fetchQuestionViaRest();
      }
    }, fallbackDelay);

    const pollInterval = IS_EDGE ? 4000 : 5000;
    pollRef.current = window.setInterval(() => {
      const st = useInterviewStore.getState();
      if (
        st.connectionStatus === 'connected' &&
        !st.currentQuestion
      ) {
        void fetchQuestionViaRest();
      }
    }, pollInterval);

    return () => {
      shouldReconnect.current = false;
      try { window.clearTimeout(fallbackTimer); } catch {}
      if (pollRef.current) {
        try { window.clearInterval(pollRef.current); } catch {}
      }
      if (reconnectTimerRef.current) {
        try { window.clearTimeout(reconnectTimerRef.current); } catch {}
      }
      if (pingRef.current) {
        try { window.clearInterval(pingRef.current); } catch {}
      }
      if (deadCheckRef.current) {
        try { window.clearInterval(deadCheckRef.current); } catch {}
      }
      const prev = wsRef.current;
      if (prev) {
        try {
          prev.onopen = null;
          prev.onmessage = null;
          prev.onerror = null;
          prev.onclose = null;
          try { prev.close(1000, 'cleanup'); } catch {}
        } catch {}
        wsRef.current = null;
      }
      useInterviewStore.getState().reset();
    };
  }, [accessToken, sessionId, fetchQuestionViaRest]);

  const reconnectNow = useCallback(() => {
    reconnectAttempt.current = 0;
    shouldReconnect.current = true;
    if (reconnectTimerRef.current) {
      try { window.clearTimeout(reconnectTimerRef.current); } catch {}
    }
    const prev = wsRef.current;
    if (prev) {
      try {
        prev.onopen = null;
        prev.onmessage = null;
        prev.onerror = null;
        prev.onclose = null;
        try { prev.close(1000, 'manual'); } catch {}
      } catch {}
      wsRef.current = null;
    }
    connectRef.current();
    void fetchQuestionViaRest();
  }, [fetchQuestionViaRest]);

  const sendAnswer = useCallback((attemptId: string, text: string | null) => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'answer',
            payload: { attempt_id: attemptId, text },
            id: ++msgIdRef.current,
          })
        );
      }
    } catch {}
  }, []);

  const requestNextQuestion = useCallback(async () => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'next_question', id: ++msgIdRef.current }));
        return;
      }
    } catch {}
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

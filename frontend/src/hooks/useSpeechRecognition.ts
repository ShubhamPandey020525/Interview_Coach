import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: ((ev?: Event) => void) | null;
  onstart: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
  [key: string]: any;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = globalThis as any;
  const candidates = [
    w?.webkitSpeechRecognition,
    w?.SpeechRecognition,
    w?.SpeechRecognitionAlt,
    (typeof window !== 'undefined' ? (window as any).webkitSpeechRecognition : undefined),
    (typeof window !== 'undefined' ? (window as any).SpeechRecognition : undefined),
  ];
  for (const c of candidates) {
    if (c && typeof c === 'function') return c as SpeechRecognitionCtor;
  }
  return null;
}

const IS_EDGE = /edg\//i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const defaultLang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  const [lang, setLang] = useState(defaultLang);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldBeListeningRef = useRef(false);
  const accumulatedRef = useRef('');
  const langRef = useRef(lang);
  const restartTimerRef = useRef<number | null>(null);
  const startRetriesRef = useRef(0);
  const startLockRef = useRef(false);
  const forceRestartTimerRef = useRef<number | null>(null);
  const lastDataAtRef = useRef<number>(0);

  useEffect(() => {
    setIsSupported(!!getSpeechRecognition());
  }, []);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      try { window.clearTimeout(restartTimerRef.current); } catch {}
      restartTimerRef.current = null;
    }
    if (forceRestartTimerRef.current) {
      try { window.clearInterval(forceRestartTimerRef.current); } catch {}
      forceRestartTimerRef.current = null;
    }
  }, []);

  const hardReset = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onstart = null;
        try { recognitionRef.current.abort(); } catch {}
        try { recognitionRef.current.stop(); } catch {}
      } catch {}
      recognitionRef.current = null;
    }
    clearRestartTimer();
    startLockRef.current = false;
  }, [clearRestartTimer]);

  const _startInstance = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    if (!shouldBeListeningRef.current) return;
    if (startLockRef.current) return;
    startLockRef.current = true;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onstart = null;
        try { recognitionRef.current.stop(); } catch {}
        try { recognitionRef.current.abort(); } catch {}
      } catch {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = langRef.current;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        startRetriesRef.current = 0;
        startLockRef.current = false;
        setIsListening(true);
        setErrorMsg(null);
        lastDataAtRef.current = Date.now();
      };

      recognition.onresult = (event: any) => {
        lastDataAtRef.current = Date.now();
        let interim = '';
        let finalText = '';
        try {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (!result) continue;
            if (result.isFinal) {
              finalText += result[0]?.transcript ?? '';
            } else {
              interim += result[0]?.transcript ?? '';
            }
          }
        } catch {}
        if (finalText) {
          accumulatedRef.current = `${accumulatedRef.current} ${finalText}`.trim();
          setTranscript(accumulatedRef.current);
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event: any) => {
        const err = event?.error ?? event?.type ?? 'unknown';
        if (!shouldBeListeningRef.current) { startLockRef.current = false; return; }

        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'permission-denied' || err === 'security') {
          shouldBeListeningRef.current = false;
          setErrorMsg('Microphone permission denied. Please allow mic access in browser settings.');
          setIsListening(false);
          startLockRef.current = false;
          return;
        }

        if (err === 'language-not-supported') {
          if (langRef.current !== 'en-US') {
            langRef.current = 'en-US';
            setLang('en-US');
            clearRestartTimer();
            startLockRef.current = false;
            restartTimerRef.current = window.setTimeout(() => _startInstance(), 200);
            return;
          }
        }

        if (err === 'no-speech') {
          clearRestartTimer();
          startLockRef.current = false;
          restartTimerRef.current = window.setTimeout(() => _startInstance(), IS_EDGE ? 200 : 150);
          return;
        }

        if (err === 'audio-capture' || err === 'bad-grammar' || err === 'service-not-started') {
          startRetriesRef.current++;
          if (startRetriesRef.current > 5) {
            shouldBeListeningRef.current = false;
            setErrorMsg(`Speech recognition error: ${err}. Live transcript unavailable.`);
            setIsListening(false);
            startLockRef.current = false;
            return;
          }
        }

        clearRestartTimer();
        startLockRef.current = false;
        restartTimerRef.current = window.setTimeout(() => _startInstance(), IS_EDGE ? 400 : 300);
      };

      recognition.onend = () => {
        setInterimTranscript('');
        if (!shouldBeListeningRef.current) {
          setIsListening(false);
          startLockRef.current = false;
          return;
        }
        clearRestartTimer();
        startLockRef.current = false;
        restartTimerRef.current = window.setTimeout(() => _startInstance(), IS_EDGE ? 150 : 100);
      };

      try {
        recognition.onaudiostart = () => { lastDataAtRef.current = Date.now(); };
        recognition.onsoundstart = () => { lastDataAtRef.current = Date.now(); };
        recognition.onspeechstart = () => { lastDataAtRef.current = Date.now(); };
      } catch {}

      recognitionRef.current = recognition;

      window.setTimeout(() => {
        try {
        (recognition as any)._startTime = Date.now();
        recognition.start();
        lastDataAtRef.current = Date.now();
      } catch {
          startLockRef.current = false;
        }
      }, IS_EDGE ? 60 : 30);

      if (forceRestartTimerRef.current) {
        try { window.clearInterval(forceRestartTimerRef.current); } catch {}
      }
      forceRestartTimerRef.current = window.setInterval(() => {
        if (!shouldBeListeningRef.current) return;
        const now = Date.now();
        const sinceData = now - lastDataAtRef.current;
        const sinceStart = now - ((recognitionRef.current as any)?._startTime || 0);
        if (sinceData > 55000 || sinceStart > 55000) {
          try {
            if (recognitionRef.current) {
              try { recognitionRef.current.abort(); } catch {}
              setTimeout(() => {
                if (shouldBeListeningRef.current) _startInstance();
              }, 50);
            }
          } catch {}
        }
      }, 10000);
    } catch {
      startLockRef.current = false;
    }
  }, [clearRestartTimer]);

  const startListening = useCallback(() => {
    if (shouldBeListeningRef.current) return;
    shouldBeListeningRef.current = true;
    accumulatedRef.current = '';
    startRetriesRef.current = 0;
    setTranscript('');
    setInterimTranscript('');
    setErrorMsg(null);
    _startInstance();
  }, [_startInstance]);

  const stopListening = useCallback(() => {
    shouldBeListeningRef.current = false;
    hardReset();
    setIsListening(false);
    setInterimTranscript('');
  }, [hardReset]);

  const resetTranscript = useCallback(() => {
    accumulatedRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setErrorMsg(null);
  }, []);

  const liveText = `${transcript} ${interimTranscript}`.trim();

  useEffect(() => () => {
    stopListening();
  }, [stopListening]);

  return {
    transcript,
    interimTranscript,
    liveText,
    isListening,
    isSupported,
    lang,
    setLang,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript,
    errorMsg,
  };
}

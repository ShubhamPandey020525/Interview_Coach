import { useCallback, useEffect, useRef } from 'react';
import { sanitizeQuestionForSpeech } from '../utils/speechText';

function pickVoice(): SpeechSynthesisVoice | undefined {
  if (!('speechSynthesis' in window)) return undefined;
  let voices: SpeechSynthesisVoice[] = [];
  try { voices = window.speechSynthesis.getVoices(); } catch {}
  if (!voices || voices.length === 0) return undefined;

  const edgePreferred = voices.find((v) => {
    const name = (v.name || '').toLowerCase();
    const isEnglish = (v.lang || '').startsWith('en');
    return isEnglish && (
      name.includes('microsoft guy') ||
      (name.includes('microsoft') && name.includes('david')) ||
      (name.includes('microsoft') && name.includes('mark')) ||
      (name.includes('microsoft') && name.includes('steve')) ||
      (name.includes('aura') && name.includes('male')) ||
      (name.includes('microsoft') && name.includes('christopher')) ||
      (name.includes('microsoft') && name.includes('eric'))
    );
  });
  if (edgePreferred) return edgePreferred;

  const maleEnglish = voices.find((v) => {
    const name = (v.name || '').toLowerCase();
    const isEnglish = (v.lang || '').startsWith('en');
    const isMaleKeyword = name.includes('male') || name.includes('david') || name.includes('google us english') || name.includes('mark') || name.includes('guy') || name.includes('brian') || name.includes('george') || name.includes('ryan') || name.includes('chris') || name.includes('aura') || name.includes('christopher') || name.includes('eric');
    const isFemaleKeyword = name.includes('female') || name.includes('zira') || name.includes('hazel') || name.includes('susan') || name.includes('haruka') || name.includes('heera') || name.includes('jenny') || name.includes('aria') || name.includes('sonia') || name.includes('jenny');
    return isEnglish && isMaleKeyword && !isFemaleKeyword;
  });
  if (maleEnglish) return maleEnglish;

  const localEnglish = voices.find((v) =>
    (v.lang || '').startsWith('en') && v.localService
  );
  if (localEnglish) return localEnglish;

  const englishVoice = voices.find((v) => (v.lang || '').startsWith('en') && !v.localService)
    || voices.find((v) => (v.lang || '').startsWith('en'));
  if (englishVoice) return englishVoice;

  return voices[0];
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const EDGE_UA_HINT = /edg\//i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');

export function useSpeechSynthesis() {
  const speakingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const voicesLoadedRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const lastCharTimeRef = useRef<number>(0);
  const pendingResumeRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const speakLockRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => {
      try { window.clearInterval(id); } catch {}
      try { window.clearTimeout(id); } catch {}
    });
    timersRef.current = [];
    if (watchdogRef.current) {
      try { window.clearTimeout(watchdogRef.current); } catch {}
      watchdogRef.current = null;
    }
    if (pendingResumeRef.current) {
      try { window.clearInterval(pendingResumeRef.current); } catch {}
      pendingResumeRef.current = null;
    }
  }, []);

  const hardCancel = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch {}
    try {
      window.speechSynthesis.pause();
    } catch {}
    try {
      window.speechSynthesis.resume();
    } catch {}
  }, []);

  const ensureVoices = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      let currentVoices: SpeechSynthesisVoice[] = [];
      try { currentVoices = window.speechSynthesis.getVoices(); } catch {}
      if (voicesLoadedRef.current && currentVoices.length > 0) { resolve(); return; }

      let attempts = 0;
      const maxAttempts = 80;
      const tryLoad = () => {
        let v: SpeechSynthesisVoice[] = [];
        try { v = window.speechSynthesis.getVoices(); } catch {}
        if (v && v.length > 0) {
          voicesLoadedRef.current = true;
          resolve();
          return;
        }
        attempts++;
        if (attempts >= maxAttempts) { resolve(); return; }
        window.setTimeout(tryLoad, 40);
      };
      try {
        window.speechSynthesis.onvoiceschanged = () => {
          voicesLoadedRef.current = true;
          resolve();
        };
      } catch {}
      try { window.speechSynthesis.getVoices(); } catch {}
      tryLoad();
    });
  }, []);

  const stopWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      try { window.clearTimeout(watchdogRef.current); } catch {}
      watchdogRef.current = null;
    }
  }, []);

  const startWatchdog = useCallback((utterance: SpeechSynthesisUtterance, chunkText: string, onDone: () => void) => {
    stopWatchdog();
    const expectedDurationMs = Math.max(3000, chunkText.length * 70);
    lastCharTimeRef.current = Date.now();

    try {
      utterance.onboundary = () => {
        lastCharTimeRef.current = Date.now();
      };
    } catch {}

    const tick = () => {
      const now = Date.now();
      const silentFor = now - lastCharTimeRef.current;
      let stillSpeaking = false;
      try {
        stillSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.paused;
      } catch {}
      if (!stillSpeaking) {
        stopWatchdog();
        onDone();
        return;
      }
      if (silentFor > Math.max(10000, expectedDurationMs * 0.6)) {
        try { window.speechSynthesis.resume(); } catch {}
        try {
          if (currentUtteranceRef.current && utterance === currentUtteranceRef.current) {
            window.speechSynthesis.speak(utterance);
          }
        } catch {}
      }
      if (silentFor > 20000) {
        stopWatchdog();
        onDone();
        return;
      }
      watchdogRef.current = window.setTimeout(tick, 400);
    };
    watchdogRef.current = window.setTimeout(tick, 400);
  }, [stopWatchdog]);

  const speakOnce = (
    text: string,
    callbacks?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: () => void;
    }
  ): Promise<void> => {
    const spokenText = sanitizeQuestionForSpeech(text);
    if (!('speechSynthesis' in window) || !spokenText) {
      callbacks?.onEnd?.();
      return Promise.resolve();
    }

    if (speakLockRef.current) {
      return queueRef.current
        .then(() => speakOnce(text, callbacks))
        .catch(() => speakOnce(text, callbacks));
    }

    return new Promise((resolve) => {
      speakLockRef.current = true;
      cancelledRef.current = false;
      clearTimers();

      const run = async () => {
        try { await ensureVoices(); } catch {}

        try {
          hardCancel();
          await waitMs(EDGE_UA_HINT ? 250 : 120);
        } catch {}

        try { hardCancel(); } catch {}

        if (pendingResumeRef.current) {
          try { window.clearInterval(pendingResumeRef.current); } catch {}
        }
        pendingResumeRef.current = window.setInterval(() => {
          try {
            if (window.speechSynthesis.speaking) {
              window.speechSynthesis.resume();
            }
          } catch {}
        }, 4000);
        timersRef.current.push(pendingResumeRef.current);

        const rawSentences = spokenText.match(/[^.!?]+[.!?]+/g) || [spokenText];
        const sentences = rawSentences.map((s) => s.trim()).filter(Boolean);
        let firstChunkStarted = false;

        for (let i = 0; i < sentences.length; i++) {
          if (cancelledRef.current) break;
          if (!speakingRef.current && i > 0) break;
          const textChunk = sentences[i];
          if (!textChunk) continue;

          await new Promise<void>((resChunk) => {
            const utterance = new SpeechSynthesisUtterance(textChunk);
            utterance.rate = EDGE_UA_HINT ? 1.0 : 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            utterance.lang = 'en-US';

            const voice = pickVoice();
            if (voice) {
              try { utterance.voice = voice; } catch {}
              if (voice.lang) {
                try { utterance.lang = voice.lang; } catch {}
              }
            }

            currentUtteranceRef.current = utterance;

            let chunkDone = false;
            const finishChunk = () => {
              if (chunkDone) return;
              chunkDone = true;
              stopWatchdog();
              currentUtteranceRef.current = null;
              resChunk();
            };

            try {
              utterance.onstart = () => {
                speakingRef.current = true;
                lastCharTimeRef.current = Date.now();
                if (!firstChunkStarted) {
                  firstChunkStarted = true;
                  callbacks?.onStart?.();
                }
              };
            } catch {}

            try {
              utterance.onend = () => { finishChunk(); };
            } catch {}

            try {
              utterance.onerror = (e: any) => {
                const errType = e?.error || e?.type || '';
                if (errType === 'canceled' || errType === 'interrupted' || errType === 'aborted') {
                  finishChunk();
                } else {
                  callbacks?.onError?.();
                  finishChunk();
                }
              };
            } catch {}

            try {
              utterance.onpause = () => {
                lastCharTimeRef.current = Date.now();
                try { window.speechSynthesis.resume(); } catch {}
              };
            } catch {}

            startWatchdog(utterance, textChunk, finishChunk);

            let triesLeft = 2;
            const attemptSpeak = () => {
              try {
                window.speechSynthesis.speak(utterance);
                try { window.speechSynthesis.resume(); } catch {}
              } catch {
                triesLeft--;
                if (triesLeft > 0) {
                  window.setTimeout(attemptSpeak, 80);
                } else {
                  finishChunk();
                }
              }
            };
            attemptSpeak();
          });
        }

        speakingRef.current = false;
        stopWatchdog();
        if (pendingResumeRef.current) {
          try { window.clearInterval(pendingResumeRef.current); } catch {}
          pendingResumeRef.current = null;
        }
        try { hardCancel(); } catch {}
        speakLockRef.current = false;
        callbacks?.onEnd?.();
        resolve();
      };

      void run();
    });
  };

  const speak = useCallback(
    (
      text: string,
      callbacks?: {
        onStart?: () => void;
        onEnd?: () => void;
        onError?: () => void;
      }
    ) => {
      queueRef.current = queueRef.current
        .then(() => speakOnce(text, callbacks))
        .catch(() => speakOnce(text, callbacks));
    },
    []
  );

  const prime = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch {}
    void ensureVoices();
    try {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      silent.rate = 1;
      window.speechSynthesis.speak(silent);
      window.speechSynthesis.cancel();
    } catch {}
  }, [ensureVoices]);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if ('speechSynthesis' in window) {
      try { hardCancel(); } catch {}
      speakingRef.current = false;
      currentUtteranceRef.current = null;
      clearTimers();
      queueRef.current = Promise.resolve();
      speakLockRef.current = false;
    }
  }, [clearTimers, hardCancel]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    void ensureVoices();

    const handler = () => {
      try { ensureVoices(); } catch {}
    };
    try {
      window.speechSynthesis.onvoiceschanged = handler;
    } catch {}

    return () => {
      clearTimers();
      try { hardCancel(); } catch {}
      try {
        window.speechSynthesis.onvoiceschanged = null;
      } catch {}
    };
  }, [ensureVoices, clearTimers, hardCancel]);

  return { speak, stop, prime, isSpeaking: () => speakingRef.current };
}

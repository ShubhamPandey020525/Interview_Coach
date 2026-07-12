import { useCallback, useEffect, useRef } from 'react';
import { sanitizeQuestionForSpeech } from '../utils/speechText';

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;

  // Try to find a local English male voice first (offline, reliable)
  const localMaleEnglish = voices.find((v) => {
    const name = v.name.toLowerCase();
    const isEnglish = v.lang.startsWith('en');
    const isMaleKeyword = name.includes('male') || name.includes('david') || name.includes('microsoft david') || name.includes('google us english') || name.includes('mark') || name.includes('guy') || name.includes('brian');
    const isFemaleKeyword = name.includes('female') || name.includes('zira') || name.includes('hazel') || name.includes('susan') || name.includes('haruka') || name.includes('heera');
    return isEnglish && isMaleKeyword && !isFemaleKeyword && v.localService;
  });
  if (localMaleEnglish) return localMaleEnglish;

  // Try any local English voice (reliable)
  const localEnglish = voices.find((v) => v.lang.startsWith('en') && v.localService);
  if (localEnglish) return localEnglish;

  // Do NOT return network-based voices, default to browser standard voice if no local English voice exists
  return undefined;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useSpeechSynthesis() {
  const speakingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.getVoices();
    const load = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      timersRef.current.forEach((id) => {
        window.clearInterval(id);
        window.clearTimeout(id);
      });
      timersRef.current = [];
    };
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => {
      window.clearInterval(id);
      window.clearTimeout(id);
    });
    timersRef.current = [];
  }, []);

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

    return new Promise((resolve) => {
      clearTimers();

      let finished = false;

      const finish = (kind: 'end' | 'error') => {
        if (finished) return;
        finished = true;
        speakingRef.current = false;
        clearTimers();
        if (kind === 'error') callbacks?.onError?.();
        else callbacks?.onEnd?.();
        resolve();
      };

      const run = async () => {
        // ONLY cancel if currently speaking to avoid freezing Chrome's speech engine
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          await waitMs(100);
        }
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(spokenText);

        // Keep a global reference to prevent Chrome's garbage collection bug
        if (typeof window !== 'undefined') {
          (window as any)._activeUtterances = (window as any)._activeUtterances || [];
          (window as any)._activeUtterances.push(utterance);
        }

        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.lang = 'en-US';

        const voice = pickVoice();
        if (voice) utterance.voice = voice;

        utterance.onstart = () => {
          speakingRef.current = true;
          callbacks?.onStart?.();
        };

        const cleanGlobalRef = () => {
          if (typeof window !== 'undefined' && (window as any)._activeUtterances) {
            (window as any)._activeUtterances = (window as any)._activeUtterances.filter(
              (u: any) => u !== utterance
            );
          }
        };

        utterance.onend = () => {
          cleanGlobalRef();
          finish('end');
        };
        utterance.onerror = (e) => {
          console.error("SpeechSynthesis utterance error:", e);
          cleanGlobalRef();
          finish('error');
        };

        // Keep-alive to prevent Chrome from pausing
        const resumeId = window.setInterval(() => {
          window.speechSynthesis.resume();
        }, 100);
        timersRef.current.push(resumeId);

        // Safety timeout
        const estimatedMs = Math.min(300000, Math.max(10000, spokenText.length * 150));
        const timeoutId = window.setTimeout(() => {
          cleanGlobalRef();
          finish('end');
        }, estimatedMs);
        timersRef.current.push(timeoutId);

        window.speechSynthesis.speak(utterance);
        window.speechSynthesis.resume();
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
    [speakOnce]
  );

  /** Must run inside a user click handler to unlock audio in Chrome/Brave. */
  const prime = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.getVoices();
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch {}
  }, []);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
      clearTimers();
      queueRef.current = Promise.resolve();
    }
  }, [clearTimers]);

  return { speak, stop, prime, isSpeaking: () => speakingRef.current };
}

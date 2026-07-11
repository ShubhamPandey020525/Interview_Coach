import { useCallback, useEffect, useRef } from 'react';
import { sanitizeQuestionForSpeech } from '../utils/speechText';

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.startsWith('en-IN')) ||
    voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')) ||
    voices.find((v) => v.lang.startsWith('en'))
  );
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

  const speakOnce = useCallback(
    (
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
        let didStart = false;

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
          // Only cancel if not already speaking
          if (!window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            await waitMs(100);
          }
          window.speechSynthesis.resume();

          const utterance = new SpeechSynthesisUtterance(spokenText);
          utterance.rate = 0.9;
          utterance.pitch = 1;
          utterance.volume = 1;
          utterance.lang = 'en-US';

          const voice = pickVoice();
          if (voice) utterance.voice = voice;

          utterance.onstart = () => {
            didStart = true;
            speakingRef.current = true;
            callbacks?.onStart?.();
          };
          utterance.onend = () => finish('end');
          utterance.onerror = () => finish('error');

          // Keep-alive to prevent Chrome from pausing
          const resumeId = window.setInterval(() => {
            window.speechSynthesis.resume();
          }, 100);
          timersRef.current.push(resumeId);

          // Safety timeout
          const estimatedMs = Math.min(300000, Math.max(10000, spokenText.length * 150));
          const timeoutId = window.setTimeout(() => finish('end'), estimatedMs);
          timersRef.current.push(timeoutId);

          window.speechSynthesis.speak(utterance);
          window.speechSynthesis.resume();
        };

        void run();
      });
    },
    [clearTimers]
  );

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
    window.speechSynthesis.resume();
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

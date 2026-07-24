import { useCallback, useEffect, useRef } from 'react';
import { sanitizeQuestionForSpeech } from '../utils/speechText';

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;

  // 1. Try to find an English male voice
  const maleEnglish = voices.find((v) => {
    const name = v.name.toLowerCase();
    const isEnglish = v.lang.startsWith('en');
    const isMaleKeyword = name.includes('male') || name.includes('david') || name.includes('google us english') || name.includes('mark') || name.includes('guy') || name.includes('brian') || name.includes('george') || name.includes('ryan');
    const isFemaleKeyword = name.includes('female') || name.includes('zira') || name.includes('hazel') || name.includes('susan') || name.includes('haruka') || name.includes('heera');
    return isEnglish && isMaleKeyword && !isFemaleKeyword;
  });
  if (maleEnglish) return maleEnglish;

  // 2. Try any English voice
  const englishVoice = voices.find((v) => v.lang.startsWith('en'));
  if (englishVoice) return englishVoice;

  // 3. Fallback to any voice available
  return voices[0];
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

      const run = async () => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          await waitMs(100);
        }
        window.speechSynthesis.resume();

        // Split text into natural sentences so browser speech synthesis never cuts off mid-sentence
        const sentences = spokenText.match(/[^.!?]+[.!?]+/g) || [spokenText];

        for (let i = 0; i < sentences.length; i++) {
          if (!speakingRef.current && i > 0) break;
          const textChunk = sentences[i].trim();
          if (!textChunk) continue;

          await new Promise<void>((resChunk) => {
            const utterance = new SpeechSynthesisUtterance(textChunk);
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            utterance.lang = 'en-US';

            const voice = pickVoice();
            if (voice) utterance.voice = voice;

            utterance.onstart = () => {
              speakingRef.current = true;
              if (i === 0) callbacks?.onStart?.();
            };

            utterance.onend = () => resChunk();
            utterance.onerror = () => resChunk();

            window.speechSynthesis.speak(utterance);
            window.speechSynthesis.resume();
          });
        }

        speakingRef.current = false;
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

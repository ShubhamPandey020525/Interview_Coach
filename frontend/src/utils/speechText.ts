/** Clean question for display and speech — no [medium], no "Question 1:" */
export function formatQuestionDisplay(text: string): string {
  return text
    .replace(/^\[(easy|medium|hard)\]\s*/i, '')
    .replace(/^Question\s+\d+:\s*/i, '')
    .replace(/[\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeQuestionForSpeech(text: string): string {
  return formatQuestionDisplay(text);
}

/** Call inside a user click handler before navigating to the interview page (Chrome TTS unlock). */
export function primeSpeechForInterview(): void {
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  } catch {}
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.resume();
  } catch {}
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      try { ctx.resume(); } catch {}
      try {
        ctx.decodeAudioData(new ArrayBuffer(1)).catch(() => {});
      } catch {}
      try { ctx.close(); } catch {}
    }
  } catch {}
}

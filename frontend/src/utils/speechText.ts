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
  window.speechSynthesis.getVoices();
  window.speechSynthesis.resume();
}

import { formatQuestionDisplay } from './speechText';

const MAX_QUESTIONS = 10;

export function buildQuestionSpeech(
  rawQuestion: string,
  _questionNumber?: number,
  _isLastQuestion?: boolean
): string {
  return formatQuestionDisplay(rawQuestion);
}

export function buildTransitionSpeech(): string {
  return '';
}

export function buildSkipSpeech(): string {
  return '';
}

export function buildClosingSpeech(): string {
  return 'Thank you. The interview is now complete.';
}

export { MAX_QUESTIONS };

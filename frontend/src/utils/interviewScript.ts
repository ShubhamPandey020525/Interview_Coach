import { formatQuestionDisplay } from './speechText';

const MAX_QUESTIONS = 8;

export function buildQuestionSpeech(
  rawQuestion: string,
  questionNumber: number,
  isLastQuestion: boolean
): string {
  const question = formatQuestionDisplay(rawQuestion);

  if (isLastQuestion) {
    return `Alright, this is our final question for today. So your question is: ${question}`;
  }
  if (questionNumber <= 1) {
    return `Hi, I'm Priya, your AI interviewer. I'll ask you questions based on your resume. So your first question is: ${question}`;
  }
  return `Thank you for that. So your next question is: ${question}`;
}

export function buildTransitionSpeech(): string {
  return 'Thank you. Let me note that down.';
}

export function buildSkipSpeech(): string {
  return "That's okay. Let's move on to the next question.";
}

export function buildClosingSpeech(): string {
  return 'That brings us to the end of the interview. Thank you for your time today. I will prepare your feedback report now.';
}

export { MAX_QUESTIONS };

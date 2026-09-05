from typing import TypedDict


class InterviewState(TypedDict, total=False):
    session_id: str
    user_id: str
    target_role: str
    resume_context: dict
    conversation_history: list[dict]
    current_stage: str
    current_question: str | None
    last_answer: str | None
    last_answer_scores: dict | None
    followup_depth: int
    scores_collected: list[dict]
    weak_areas: list[str]
    checkpoint_counter: int
    next_agent: str
    pending_evaluation: dict | None
    question_count: int
    max_questions: int
    question_sequence: list[str]

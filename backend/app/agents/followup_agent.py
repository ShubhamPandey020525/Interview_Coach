from datetime import datetime

from app.services.llm_provider import LLMProvider
from app.store import _in_memory_attempts


async def followup_node(state: dict, llm: LLMProvider) -> dict:
    """Follow-up Agent — probes deeper when the previous answer was weak."""
    session_id = state["session_id"]
    session_attempts = [
        a for a in _in_memory_attempts.values()
        if str(a.session_id) == str(session_id)
    ]
    session_attempts.sort(key=lambda a: a.sequence_number)
    last_attempt = session_attempts[-1] if session_attempts else None

    question_text = last_attempt.question_text if last_attempt else ""
    answer_text = (last_attempt.answer_text or "") if last_attempt else ""
    reasoning = state.get("last_answer_scores", {}).get("reasoning", "")
    topic = getattr(last_attempt, "topic", None) if last_attempt else None
    angle = getattr(last_attempt, "angle", None) if last_attempt else None

    result = await llm.generate_followup_question(
        target_role=state["target_role"],
        question_text=question_text,
        answer_text=answer_text,
        reasoning=reasoning,
        resume_context=state.get("resume_context", {}),
        conversation_history=state.get("conversation_history", []),
    )

    eval_result = None
    if state.get("last_answer") and state.get("pending_evaluation"):
        eval_result = await llm.evaluate_answer(
            state.get("current_question", ""),
            state["last_answer"],
            "followup",
            state.get("resume_context", {}),
        )

    updates: dict = {
        "current_question": result.question,
        "current_stage": "followup",
        "current_topic": topic,
        "current_angle": angle,
        "followup_depth": state.get("followup_depth", 0) + 1,
        "question_count": state.get("question_count", 0) + 1,
        "conversation_history": state.get("conversation_history", [])
        + [
            {
                "role": "assistant",
                "content": result.question,
                "agent_type": "followup",
                "timestamp": datetime.utcnow().isoformat(),
                "topic": topic,
                "angle": angle,
            }
        ],
    }

    if eval_result:
        updates["last_answer_scores"] = {"score": eval_result.score, "reasoning": eval_result.reasoning}
        updates["scores_collected"] = state.get("scores_collected", []) + [
            {"type": "technical", "score": eval_result.score}
        ]
        if eval_result.score < 65:
            updates["weak_areas"] = list(set(state.get("weak_areas", []) + ["technical depth"]))

    return updates

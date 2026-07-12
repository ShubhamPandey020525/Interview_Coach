from datetime import datetime

from app.services.llm_provider import LLMProvider, select_next_topic_and_angle_v2, get_user_question_history
from app.store import _in_memory_attempts


async def technical_node(state: dict, llm: LLMProvider) -> dict:
    """Technical Agent — role/skill-relevant questions and evaluation."""
    user_id = state["user_id"]
    session_id = state["session_id"]
    question_count = state.get("question_count", 0)
    seq = state.get("question_sequence") or []
    question_type = seq[question_count] if question_count < len(seq) else "concept"

    user_history = get_user_question_history(user_id)

    session_attempts = [
        a for a in _in_memory_attempts.values()
        if str(a.session_id) == str(session_id) and getattr(a, "topic", None) is not None
    ]
    session_attempts.sort(key=lambda a: a.sequence_number)
    session_history = [(a.topic, a.angle) for a in session_attempts]

    topic, angle = select_next_topic_and_angle_v2(state.get("resume_context", {}), user_history, session_history, question_type)

    result = await llm.generate_technical_question(
        state["target_role"],
        topic,
        angle,
        state.get("resume_context", {}),
        state.get("conversation_history", []),
        question_type,
    )

    updates: dict = {
        "current_question": result.question,
        "current_stage": "technical",
        "current_topic": topic,
        "current_angle": angle,
        "conversation_history": state.get("conversation_history", [])
        + [
            {
                "role": "assistant",
                "content": result.question,
                "agent_type": "technical",
                "timestamp": datetime.utcnow().isoformat(),
                "topic": topic,
                "angle": angle,
            }
        ],
        "checkpoint_counter": state.get("checkpoint_counter", 0) + 1,
        "question_count": state.get("question_count", 0) + 1,
    }

    if state.get("last_answer") and state.get("pending_evaluation"):
        eval_result = await llm.evaluate_answer(
            state.get("current_question", ""),
            state["last_answer"],
            "technical",
            state.get("resume_context", {}),
        )
        updates["last_answer_scores"] = {"score": eval_result.score, "reasoning": eval_result.reasoning}
        updates["scores_collected"] = state.get("scores_collected", []) + [
            {"type": "technical", "score": eval_result.score}
        ]
        if eval_result.score < 65:
            updates["weak_areas"] = list(set(state.get("weak_areas", []) + ["technical fundamentals"]))

    return updates

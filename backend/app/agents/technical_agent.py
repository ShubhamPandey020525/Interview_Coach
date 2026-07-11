from datetime import datetime

from app.services.llm_provider import LLMProvider


async def technical_node(state: dict, llm: LLMProvider) -> dict:
    """Technical Agent — role/skill-relevant questions and evaluation."""
    result = await llm.generate_question(
        state["target_role"],
        state.get("resume_context", {}),
        "technical",
        state.get("conversation_history", []),
        state.get("weak_areas", []),
        state.get("scores_collected", []),
    )

    updates: dict = {
        "current_question": result.question,
        "current_stage": "technical",
        "conversation_history": state.get("conversation_history", [])
        + [
            {
                "role": "assistant",
                "content": result.question,
                "agent_type": "technical",
                "timestamp": datetime.utcnow().isoformat(),
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

from datetime import datetime

from app.services.llm_provider import LLMProvider


async def followup_node(state: dict, llm: LLMProvider) -> dict:
    """Follow-up Agent — probes deeper when the previous answer was weak."""
    result = await llm.generate_question(
        state["target_role"],
        state.get("resume_context", {}),
        "followup",
        state.get("conversation_history", []),
        state.get("weak_areas", []),
        state.get("scores_collected", []),
    )

    eval_result = None
    if state.get("last_answer"):
        eval_result = await llm.evaluate_answer(
            state.get("current_question", ""),
            state["last_answer"],
            "followup",
            state.get("resume_context", {}),
        )

    updates: dict = {
        "current_question": result.question,
        "current_stage": "followup",
        "followup_depth": state.get("followup_depth", 0) + 1,
        "conversation_history": state.get("conversation_history", [])
        + [
            {
                "role": "assistant",
                "content": result.question,
                "agent_type": "followup",
                "timestamp": datetime.utcnow().isoformat(),
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

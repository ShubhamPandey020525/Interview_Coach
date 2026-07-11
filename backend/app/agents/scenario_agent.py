from datetime import datetime

from app.services.llm_provider import LLMProvider


async def scenario_node(state: dict, llm: LLMProvider) -> dict:
    """Scenario Agent — open-ended design/behavioral scenarios."""
    result = await llm.generate_question(
        state["target_role"],
        state.get("resume_context", {}),
        "scenario",
        state.get("conversation_history", []),
        state.get("weak_areas", []),
        state.get("scores_collected", []),
    )

    updates: dict = {
        "current_question": result.question,
        "current_stage": "scenario",
        "followup_depth": 0,
        "conversation_history": state.get("conversation_history", [])
        + [
            {
                "role": "assistant",
                "content": result.question,
                "agent_type": "scenario",
                "timestamp": datetime.utcnow().isoformat(),
            }
        ],
        "question_count": state.get("question_count", 0) + 1,
    }

    if state.get("last_answer"):
        eval_result = await llm.evaluate_answer(
            state.get("current_question", ""),
            state["last_answer"],
            "scenario",
            state.get("resume_context", {}),
        )
        updates["last_answer_scores"] = {"score": eval_result.score, "reasoning": eval_result.reasoning}
        updates["scores_collected"] = state.get("scores_collected", []) + [
            {"type": "communication", "score": eval_result.score}
        ]
        if eval_result.score < 65:
            updates["weak_areas"] = list(set(state.get("weak_areas", []) + ["scenario handling"]))

    return updates

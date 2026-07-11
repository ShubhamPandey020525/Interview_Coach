
from datetime import datetime

from app.services.llm_provider import LLMProvider


async def personality_node(state: dict, llm: LLMProvider) -> dict:
    """Personality/Experience Agent — asks questions about resume experience, projects, achievements."""
    result = await llm.generate_question(
        state["target_role"],
        state.get("resume_context", {}),
        "personality",
        state.get("conversation_history", []),
        state.get("weak_areas", []),
        state.get("scores_collected", []),
    )

    updates: dict = {
        "current_question": result.question,
        "current_stage": "personality",
        "followup_depth": 0,
        "conversation_history": state.get("conversation_history", [])
        + [
            {
                "role": "assistant",
                "content": result.question,
                "agent_type": "personality",
                "timestamp": datetime.utcnow().isoformat(),
            }
        ],
        "question_count": state.get("question_count", 0) + 1,
    }

    if state.get("last_answer"):
        eval_result = await llm.evaluate_answer(
            state.get("current_question", ""),
            state["last_answer"],
            "personality",
            state.get("resume_context", {}),
        )
        updates["last_answer_scores"] = {"score": eval_result.score, "reasoning": eval_result.reasoning}
        updates["scores_collected"] = state.get("scores_collected", []) + [
            {"type": "personality", "score": eval_result.score}
        ]

    return updates

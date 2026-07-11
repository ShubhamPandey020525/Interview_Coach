from app.services.llm_provider import LLMProvider


async def learning_node(state: dict, llm: LLMProvider) -> dict:
    """Learning Agent — synthesizes weak areas and recommended resources."""
    plan = await llm.generate_learning_plan(
        state.get("scores_collected", []),
        state.get("weak_areas", []),
        state["target_role"],
        state.get("resume_context", {}),
    )
    return {
        "current_stage": "complete",
        "weak_areas": plan.get("weak_areas", state.get("weak_areas", [])),
        "learning_plan": plan,
    }

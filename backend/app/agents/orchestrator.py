
MAX_QUESTIONS = 10


def decide_next_stage(state: dict) -> str:
    """Planner logic for the Interview Orchestrator Agent."""
    current_stage = state.get("current_stage", "technical")
    question_count = state.get("question_count", 0)
    max_questions = state.get("max_questions", MAX_QUESTIONS)

    if current_stage == "complete" or question_count >= max_questions:
        return "learning"

    if current_stage == "learning":
        return "learning"

    seq = state.get("question_sequence")
    if not seq or question_count >= len(seq):
        return "technical"

    current_type = seq[question_count]
    if current_type == "followup":
        return "followup"

    return "technical"


async def orchestrator_node(state: dict, llm=None) -> dict:
    """Interview Orchestrator Agent — routes to the next specialized agent."""
    next_stage = decide_next_stage(state)
    return {"current_stage": next_stage, "next_agent": next_stage}

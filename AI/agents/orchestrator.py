
MAX_QUESTIONS = 10


def decide_next_stage(state: dict) -> str:
    """Planner logic for the Interview Orchestrator Agent."""
    current_stage = state.get("current_stage", "technical")
    question_count = state.get("question_count", 0)
    qc = question_count
    max_questions = state.get("max_questions", MAX_QUESTIONS)

    if current_stage == "complete" or qc >= max_questions:
        return "learning"

    if current_stage == "learning":
        return "learning"

    seq = state.get("question_sequence")
    if seq and qc < len(seq):
        current_type = seq[qc]
        if current_type == "followup":
            return "followup"
        if current_type == "scenario":
            return "scenario"
        if current_type == "personality":
            return "personality"

    if (qc + 1) % 3 == 0:
        return "personality"

    if "scenario_pending" in state or (qc % 10 == 4):
        return "scenario"

    last_scores = state.get("last_answer_scores", {}) or {}
    last_score = last_scores.get("score")
    if last_score is not None and last_score < 65:
        return "followup"

    return "technical"


async def orchestrator_node(state: dict, llm=None) -> dict:
    """Interview Orchestrator Agent — routes to the next specialized agent."""
    next_stage = decide_next_stage(state)
    return {"current_stage": next_stage, "next_agent": next_stage}

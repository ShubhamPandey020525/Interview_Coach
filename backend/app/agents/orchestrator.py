FOLLOWUP_SCORE_THRESHOLD = 65
FOLLOWUP_DEPTH_CAP = 2
SCENARIO_INTERVAL = 4
MAX_QUESTIONS = 8


def decide_next_stage(state: dict) -> str:
    """Planner logic for the Interview Orchestrator Agent."""
    current_stage = state.get("current_stage", "technical")
    last_scores = state.get("last_answer_scores")
    followup_depth = state.get("followup_depth", 0)
    checkpoint_counter = state.get("checkpoint_counter", 0)
    question_count = state.get("question_count", 0)
    max_questions = state.get("max_questions", MAX_QUESTIONS)

    if current_stage == "complete" or question_count >= max_questions:
        return "learning"

    if current_stage == "learning":
        return "learning"

    if last_scores and last_scores.get("score", 100) < FOLLOWUP_SCORE_THRESHOLD and followup_depth < FOLLOWUP_DEPTH_CAP:
        return "followup"

    if checkpoint_counter > 0 and checkpoint_counter % SCENARIO_INTERVAL == 0 and current_stage != "scenario":
        return "scenario"

    if current_stage in ("followup", "scenario") and last_scores:
        return "technical"

    return "technical"


async def orchestrator_node(state: dict, llm=None) -> dict:
    """Interview Orchestrator Agent — routes to the next specialized agent."""
    next_stage = decide_next_stage(state)
    return {"current_stage": next_stage, "next_agent": next_stage}

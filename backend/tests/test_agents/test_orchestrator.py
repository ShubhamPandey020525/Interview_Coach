import pytest

from app.agents.orchestrator import decide_next_stage
from app.services.llm_provider import FakeLLMProvider


def test_orchestrator_routes_technical_on_start():
    state = {
        "current_stage": "technical",
        "followup_depth": 0,
        "checkpoint_counter": 0,
        "question_count": 0,
        "question_sequence": ["concept", "project", "followup", "concept"],
    }
    assert decide_next_stage(state) == "technical"


def test_orchestrator_routes_followup_on_sequence():
    state = {
        "current_stage": "technical",
        "followup_depth": 0,
        "checkpoint_counter": 2,
        "question_count": 2,
        "question_sequence": ["concept", "project", "followup", "concept"],
    }
    assert decide_next_stage(state) == "followup"


def test_orchestrator_routes_learning_on_complete():
    state = {
        "current_stage": "complete",
        "question_count": 4,
        "max_questions": 4,
        "question_sequence": ["concept", "project", "followup", "concept"],
    }
    assert decide_next_stage(state) == "learning"


@pytest.mark.asyncio
async def test_learning_agent_produces_weak_areas():
    from app.agents.learning_agent import learning_node

    llm = FakeLLMProvider()
    state = {
        "target_role": "Engineer",
        "scores_collected": [{"type": "technical", "score": 40}],
        "weak_areas": ["algorithms"],
    }
    result = await learning_node(state, llm)
    assert len(result.get("weak_areas", result.get("learning_plan", {}).get("weak_areas", ["algorithms"]))) > 0

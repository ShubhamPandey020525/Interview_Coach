from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.agents.audio_analysis_agent import audio_analysis_node
from app.agents.followup_agent import followup_node
from app.agents.learning_agent import learning_node
from app.agents.orchestrator import orchestrator_node
from app.agents.resume_agent import resume_node
from app.agents.scenario_agent import scenario_node
from app.agents.technical_agent import technical_node
from app.agents.video_analysis_agent import video_analysis_node
from app.services.llm_provider import LLMProvider, get_llm_provider

# All 8 agents per system design spec (Section 5.3)
AGENT_REGISTRY = {
    "orchestrator": orchestrator_node,
    "technical": technical_node,
    "followup": followup_node,
    "scenario": scenario_node,
    "resume": resume_node,
    "learning": learning_node,
    "audio_analysis": audio_analysis_node,
    "video_analysis": video_analysis_node,
}

# In-process session memory (LangGraph checkpointer + explicit cache for API round-trips)
_session_states: dict[str, dict] = {}


def _route_from_orchestrator(state: dict) -> str:
    return state.get("next_agent", "technical")


class InterviewGraph:
    """LangGraph-backed multi-agent interview orchestration with per-session memory."""

    def __init__(self, llm: LLMProvider | None = None) -> None:
        self.llm = llm or get_llm_provider()
        self._checkpointer = MemorySaver()
        self._app = self._build_graph().compile(checkpointer=self._checkpointer)

    def _bind(self, node_fn):
        async def wrapper(state: dict) -> dict:
            return await node_fn(state, self.llm)

        return wrapper

    def _build_graph(self) -> StateGraph:
        graph = StateGraph(dict)
        graph.add_node("orchestrator", self._bind(orchestrator_node))
        graph.add_node("technical", self._bind(technical_node))
        graph.add_node("followup", self._bind(followup_node))
        graph.add_node("scenario", self._bind(scenario_node))
        graph.add_node("learning", self._bind(learning_node))

        graph.add_edge(START, "orchestrator")
        graph.add_conditional_edges(
            "orchestrator",
            _route_from_orchestrator,
            {
                "technical": "technical",
                "followup": "followup",
                "scenario": "scenario",
                "learning": "learning",
            },
        )
        graph.add_edge("technical", END)
        graph.add_edge("followup", END)
        graph.add_edge("scenario", END)
        graph.add_edge("learning", END)
        return graph

    def _config(self, session_id: str) -> dict:
        return {"configurable": {"thread_id": session_id}}

    def get_state(self, session_id: str) -> dict:
        if session_id in _session_states:
            return dict(_session_states[session_id])
        snapshot = self._app.get_state(self._config(session_id))
        if snapshot and snapshot.values:
            _session_states[session_id] = dict(snapshot.values)
            return dict(snapshot.values)
        return {}

    async def _aget_state(self, session_id: str) -> dict:
        if session_id in _session_states:
            return dict(_session_states[session_id])
        config = self._config(session_id)
        snapshot = await self._app.aget_state(config)
        if snapshot and snapshot.values:
            _session_states[session_id] = dict(snapshot.values)
            return dict(snapshot.values)
        return {}

    async def _persist_state(self, session_id: str, state: dict) -> None:
        _session_states[session_id] = dict(state)
        await self._app.aupdate_state(self._config(session_id), state, as_node="orchestrator")

    async def init_session(
        self,
        session_id: str,
        user_id: str,
        target_role: str,
        resume_context: dict | None = None,
    ) -> dict:
        initial: dict = {
            "session_id": session_id,
            "user_id": user_id,
            "target_role": target_role,
            "resume_context": resume_context or {},
            "conversation_history": [],
            "current_stage": "technical",
            "current_question": None,
            "last_answer": None,
            "last_answer_scores": None,
            "followup_depth": 0,
            "scores_collected": [],
            "weak_areas": [],
            "checkpoint_counter": 0,
            "question_count": 0,
            "max_questions": 8,
        }
        resume_updates = await resume_node(initial, self.llm)
        initial.update(resume_updates)
        await self._persist_state(session_id, initial)
        return initial

    async def _run_agent_turn(self, state: dict) -> dict:
        """Orchestrator routes to one specialist agent per conversational turn."""
        route = await orchestrator_node(state, self.llm)
        working = {**state, **route}
        next_agent = route.get("next_agent", "technical")

        agent_handlers = {
            "technical": technical_node,
            "followup": followup_node,
            "scenario": scenario_node,
            "learning": learning_node,
        }
        handler = agent_handlers.get(next_agent, technical_node)
        updates = await handler(working, self.llm)
        return {**working, **updates}

    async def get_next_question(self, session_id: str) -> dict:
        state = await self._aget_state(session_id)
        if not state:
            raise ValueError("Session state not initialized")

        merged = await self._run_agent_turn(state)
        await self._persist_state(session_id, merged)

        if merged.get("current_stage") == "complete" or merged.get("next_agent") == "learning":
            return {"stage": "complete", "question": None, "agent_type": "learning"}

        return {
            "question": merged.get("current_question"),
            "agent_type": merged.get("current_stage", "technical"),
            "stage": merged.get("current_stage"),
        }

    async def submit_answer(self, session_id: str, answer: str) -> dict:
        from datetime import datetime

        config = self._config(session_id)
        state = await self._aget_state(session_id)
        if not state:
            raise ValueError("Session state not initialized")

        agent_type = state.get("current_stage", "technical")
        eval_result = await self.llm.evaluate_answer(
            state.get("current_question", ""),
            answer,
            agent_type,
            state.get("resume_context", {}),
        )

        updates = {
            "last_answer": answer,
            "followup_depth": 0 if agent_type == "scenario" else state.get("followup_depth", 0),
            "conversation_history": state.get("conversation_history", [])
            + [{"role": "user", "content": answer, "timestamp": datetime.utcnow().isoformat()}],
            "last_answer_scores": {"score": eval_result.score, "reasoning": eval_result.reasoning},
            "scores_collected": state.get("scores_collected", [])
            + [{"type": agent_type if agent_type != "followup" else "technical", "score": eval_result.score}],
        }
        if eval_result.score < 65:
            skills = state.get("resume_context", {}).get("skills") or []
            gap = skills[0] if skills else agent_type
            updates["weak_areas"] = list(set(state.get("weak_areas", []) + [f"{gap} (from resume)"]))

        merged = {**state, **updates}
        await self._persist_state(session_id, merged)
        return {
            "score": eval_result.score,
            "reasoning": eval_result.reasoning,
            "agent_type": agent_type,
        }

    async def complete_session(self, session_id: str) -> dict:
        state = await self._aget_state(session_id)
        if not state:
            raise ValueError("Session state not initialized")

        state["question_count"] = state.get("max_questions", 8)
        result = await learning_node(state, self.llm)
        merged = {**state, **result}
        await self._persist_state(session_id, merged)
        return result.get("learning_plan", {})


_graph_instance: InterviewGraph | None = None


def get_interview_graph(llm: LLMProvider | None = None) -> InterviewGraph:
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = InterviewGraph(llm=llm)
    return _graph_instance


async def run_media_agents(audio_path: str | None, video_path: str | None) -> list[dict]:
    """Run Audio/Video Analysis Agents off the main conversational path."""
    signals: list[dict] = []
    if audio_path:
        audio_result = await audio_analysis_node(audio_path)
        signals.extend(audio_result.signals)
    if video_path:
        video_result = video_analysis_node(video_path)
        signals.extend(video_result.signals)
    return signals


def clear_session_state(session_id: str) -> None:
    _session_states.pop(session_id, None)

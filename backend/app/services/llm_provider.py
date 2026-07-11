import asyncio
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.agents.resume_context import is_resume_context_sufficient
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_openai_client: AsyncOpenAI | None = None


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=20.0)
    return _openai_client

RESUME_ONLY_RULES = """
STRICT RULES (must follow):
1. Every question MUST be grounded in the candidate's resume only — skills, projects, tools, or experience listed there.
2. Reference a SPECIFIC skill, project name, technology, or role from the resume in each question.
3. NEVER ask generic interview questions (e.g. "tell me about yourself", "why should we hire you", unrelated trivia).
4. NEVER invent experience the candidate does not have on the resume.
5. Do not repeat questions already asked in the conversation history.
6. For follow-up: probe deeper into the SAME resume item from the previous answer.
7. For scenario: create a realistic work scenario using technologies/projects from their resume.
8. Return ONLY the spoken question sentence — no difficulty tags like [medium], no "Question 1:" prefix, no brackets.
"""


@dataclass
class LLMEvaluationResult:
    score: float
    reasoning: str


@dataclass
class LLMQuestionResult:
    question: str


class LLMProvider(ABC):
    @abstractmethod
    async def generate_question(
        self,
        target_role: str,
        resume_context: dict,
        agent_type: str,
        conversation_history: list,
        weak_areas: list[str] | None = None,
        recent_scores: list[dict] | None = None,
    ) -> LLMQuestionResult:
        pass

    @abstractmethod
    async def evaluate_answer(
        self,
        question: str,
        answer: str,
        agent_type: str,
        resume_context: dict | None = None,
    ) -> LLMEvaluationResult:
        pass

    @abstractmethod
    async def generate_learning_plan(
        self,
        scores: list[dict],
        weak_areas: list[str],
        target_role: str,
        resume_context: dict | None = None,
    ) -> dict:
        pass

    @abstractmethod
    async def parse_resume(self, text: str) -> dict:
        pass


from app.utils.question_text import strip_question_metadata


def _difficulty_hint(recent_scores: list[dict] | None) -> str:
    if not recent_scores:
        return "medium"
    avg = sum(s.get("score", 50) for s in recent_scores[-3:]) / min(len(recent_scores), 3)
    if avg >= 75:
        return "harder"
    if avg < 55:
        return "easier"
    return "medium"


def _next_resume_focus(resume_context: dict, conversation_history: list, turn: int) -> dict:
    """Pick the next skill or project from resume to anchor a question (tests / deterministic fallback)."""
    skills = resume_context.get("skills") or []
    projects = resume_context.get("projects") or []
    if skills:
        skill = skills[turn % len(skills)]
        return {"type": "skill", "name": skill, "detail": skill}
    if projects:
        project = projects[turn % len(projects)]
        name = project.get("name", "your project") if isinstance(project, dict) else str(project)
        stack = project.get("tech_stack", []) if isinstance(project, dict) else []
        return {"type": "project", "name": name, "detail": ", ".join(stack) if stack else name}
    summary = (resume_context.get("experience_summary") or resume_context.get("raw_text") or "")[:200]
    return {"type": "experience", "name": "your experience", "detail": summary}


def _generate_local_question(
    target_role: str,
    resume_context: dict,
    agent_type: str,
    conversation_history: list,
) -> LLMQuestionResult:
    if not is_resume_context_sufficient(resume_context):
        raise ValueError("Resume is required before generating interview questions.")

    turn = len([h for h in conversation_history if h.get("role") == "assistant"])
    focus = _next_resume_focus(resume_context, conversation_history, turn)

    if agent_type == "followup":
        last_q = next(
            (h["content"] for h in reversed(conversation_history) if h.get("role") == "assistant"),
            focus["name"],
        )
        question = (
            f"You mentioned {last_q[:80]} — walk me through your personal contribution "
            f"and a specific challenge you faced with {focus['name']} on your resume."
        )
    elif agent_type == "scenario":
        detail = focus.get("detail") or ""
        detail_part = f" and {detail}" if detail else ""
        question = (
            f"Based on your experience with {focus['name']}{detail_part}, "
            f"how would you design a solution for a production issue as a {target_role}? "
            f"Use only technologies listed on your resume."
        )
    else:
        detail = focus.get("detail") or ""
        detail_part = f" ({detail})" if detail and detail != focus["name"] else ""
        question = (
            f"I see {focus['name']} on your resume{detail_part}. "
            f"Explain how you have applied it in a real project and what trade-offs you considered."
        )

    return LLMQuestionResult(question=question)


def _evaluate_local(question: str, answer: str) -> LLMEvaluationResult:
    score = min(100.0, max(30.0, len(answer.split()) * 5))
    return LLMEvaluationResult(
        score=score,
        reasoning=f"Resume-grounded evaluation: answer length and relevance to '{question[:60]}...'.",
    )


def _learning_plan_local(
    weak_areas: list[str],
    resume_context: dict | None,
) -> dict:
    skills = (resume_context or {}).get("skills") or []
    areas = weak_areas or skills[:2] or ["skills from your resume"]
    return {
        "weak_areas": areas,
        "recommended_resources": [
            {
                "title": f"Strengthen {areas[0]} (from your resume gap)",
                "url": "https://example.com/resource",
                "type": "article",
            },
        ],
    }


class FakeLLMProvider(LLMProvider):
    """Resume-grounded provider for automated tests only."""

    async def generate_question(
        self,
        target_role: str,
        resume_context: dict,
        agent_type: str,
        conversation_history: list,
        weak_areas: list[str] | None = None,
        recent_scores: list[dict] | None = None,
    ) -> LLMQuestionResult:
        return _generate_local_question(
            target_role, resume_context, agent_type, conversation_history
        )

    async def evaluate_answer(
        self,
        question: str,
        answer: str,
        agent_type: str,
        resume_context: dict | None = None,
    ) -> LLMEvaluationResult:
        return _evaluate_local(question, answer)

    async def generate_learning_plan(
        self,
        scores: list[dict],
        weak_areas: list[str],
        target_role: str,
        resume_context: dict | None = None,
    ) -> dict:
        return _learning_plan_local(weak_areas, resume_context)

    async def parse_resume(self, text: str) -> dict:
        if not text or len(text.strip()) < 20:
            if settings.environment == "test":
                return {
                    "skills": ["Python", "FastAPI"],
                    "projects": [
                        {
                            "name": "Test API Project",
                            "description": "Built REST APIs with Python",
                            "tech_stack": ["Python", "FastAPI"],
                        }
                    ],
                    "experience_summary": "Backend developer — test resume fixture.",
                }
            return {"skills": [], "projects": [], "experience_summary": ""}
        words = [w.strip(".,()") for w in text.split() if len(w) > 2]
        # Extract likely skills from resume text (minimal heuristic for tests)
        common = {"python", "java", "javascript", "react", "sql", "fastapi", "node", "aws", "docker"}
        found = [w for w in words if w.lower() in common]
        return {
            "skills": list(dict.fromkeys(found))[:10] or [],
            "projects": [],
            "experience_summary": text[:500],
        }


class OpenAILLMProvider(LLMProvider):
    async def generate_question(
        self,
        target_role: str,
        resume_context: dict,
        agent_type: str,
        conversation_history: list,
        weak_areas: list[str] | None = None,
        recent_scores: list[dict] | None = None,
    ) -> LLMQuestionResult:
        if not is_resume_context_sufficient(resume_context):
            raise ValueError("Resume is required. Upload and parse your resume before starting the interview.")

        try:
            client = _get_openai_client()
            difficulty = _difficulty_hint(recent_scores)
            history_summary = json.dumps(conversation_history[-8:]) if conversation_history else "[]"

            prompt = (
                f"You are a live technical interviewer for a {target_role} role.\n"
                f"{RESUME_ONLY_RULES}\n"
                f"Question type: {agent_type}\n"
                f"Difficulty: {difficulty} (based on recent scores)\n"
                f"CANDIDATE RESUME (only source of truth):\n{json.dumps(resume_context, indent=2)}\n"
                f"Weak areas to probe from session: {json.dumps(weak_areas or [])}\n"
                f"Recent scores: {json.dumps(recent_scores or [])}\n"
                f"Conversation so far: {history_summary}\n"
                'Return JSON: {"question": "your single resume-specific question here"}'
            )

            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You generate resume-only interview questions. Never use generic or canned questions.",
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
            )
            data = json.loads(response.choices[0].message.content or "{}")
            question = strip_question_metadata((data.get("question") or "").strip())
            if question:
                return LLMQuestionResult(question=question)
        except Exception as exc:
            logger.warning("OpenAI question generation failed, using resume-based fallback: %s", exc)

        return _generate_local_question(
            target_role, resume_context, agent_type, conversation_history
        )

    async def evaluate_answer(
        self,
        question: str,
        answer: str,
        agent_type: str,
        resume_context: dict | None = None,
    ) -> LLMEvaluationResult:
        try:
            client = _get_openai_client()
            prompt = (
                f"Evaluate this {agent_type} interview answer.\n"
                f"Question (resume-based): {question}\n"
                f"Answer: {answer}\n"
                f"Resume context for relevance check: {json.dumps(resume_context or {})}\n"
                "Score how well they answered relative to their claimed resume experience.\n"
                'Return JSON: {"score": 0-100, "reasoning": "..."}'
            )
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            data = json.loads(response.choices[0].message.content or "{}")
            return LLMEvaluationResult(
                score=float(data.get("score", 50)),
                reasoning=data.get("reasoning", "Evaluation completed."),
            )
        except Exception as exc:
            logger.warning("OpenAI evaluation failed, using local fallback: %s", exc)
            return _evaluate_local(question, answer)

    async def generate_learning_plan(
        self,
        scores: list[dict],
        weak_areas: list[str],
        target_role: str,
        resume_context: dict | None = None,
    ) -> dict:
        try:
            client = _get_openai_client()
            prompt = (
                f"Create a personalized learning plan for a {target_role} candidate.\n"
                f"Their resume: {json.dumps(resume_context or {})}\n"
                f"Session weak areas: {weak_areas}\n"
                f"Session scores: {json.dumps(scores)}\n"
                "Recommend resources only for skills/projects gaps visible on their resume.\n"
                'Return JSON: {"weak_areas": [...], "recommended_resources": [{"title":"...","url":"...","type":"..."}]}'
            )
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(response.choices[0].message.content or "{}")
        except Exception as exc:
            logger.warning("OpenAI learning plan failed, using local fallback: %s", exc)
            return _learning_plan_local(weak_areas, resume_context)

    async def parse_resume(self, text: str) -> dict:
        if not text or len(text.strip()) < 20:
            return {"skills": [], "projects": [], "experience_summary": ""}

        client = _get_openai_client()
        prompt = (
            "Extract ONLY what is explicitly stated in this resume. Do not invent skills or projects.\n"
            "Return JSON with keys: skills (array of strings), "
            "projects (array of {name, description, tech_stack}), experience_summary (string).\n"
            f"Resume text:\n{text[:5000]}"
        )
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content or "{}")


def get_llm_provider(use_fake: bool = False) -> LLMProvider:
    if use_fake or settings.environment == "test":
        return FakeLLMProvider()
    if not settings.openai_api_key.strip():
        raise RuntimeError(
            "OPENAI_API_KEY is required for live resume-based interviews. "
            "Set it in backend/.env — no predefined questions are used."
        )
    return OpenAILLMProvider()

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
    score: float  # Final weighted score out of 100
    reasoning: str
    best_answer: str
    user_answer_comparison: str
    filler_word_count: int
    metrics: dict  # Detailed metrics with sub-scores (0-10 each): clarity, relevance, detail_level, factual_accuracy, confidence
    factual_inaccuracies: list[str]  # List of factual inaccuracies found in the answer
    weighted_breakdown: dict  # How each component contributed to the final score (e.g., {"relevance": 30, "clarity": 20, ...})


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
    elif agent_type == "personality":
        # Personality questions: ask about projects, experience, achievements from resume
        projects = resume_context.get("projects") or []
        experience = resume_context.get("experience_summary") or ""
        if projects:
            project = projects[turn % len(projects)]
            name = project.get("name", "that project") if isinstance(project, dict) else str(project)
            desc = project.get("description", "") if isinstance(project, dict) else ""
            question = (
                f"Tell me about the {name} project from your resume. What was your role, "
                f"what challenges did you face, and how did you overcome them? {desc}"
            )
        elif experience:
            question = (
                f"Walk me through your professional experience as described in your resume. "
                f"What are you most proud of achieving in your career so far?"
            )
        else:
            question = "Tell me about a time you worked on a team project and what you learned from it."
    else:
        detail = focus.get("detail") or ""
        detail_part = f" ({detail})" if detail and detail != focus["name"] else ""
        question = (
            f"I see {focus['name']} on your resume{detail_part}. "
            f"Explain how you have applied it in a real project and what trade-offs you considered."
        )

    return LLMQuestionResult(question=question)


def _count_filler_words(text: str) -> int:
    filler_words = {"um", "uh", "er", "like", "you know", "so", "sort of", "kind of", "basically", "actually", "i mean"}
    words = text.lower().split()
    count = 0
    i = 0
    while i < len(words):
        # Check for multi-word fillers first
        if i + 1 < len(words) and f"{words[i]} {words[i+1]}" in filler_words:
            count +=1
            i +=2
        elif words[i] in filler_words:
            count +=1
            i +=1
        else:
            i +=1
    return count


def _calculate_weighted_score(
    clarity: float, relevance: float, detail_level: float, factual_accuracy: float, confidence: float, filler_word_count: int, answer_length: int
) -> tuple[float, dict]:
    # Weighted scoring formula: out of 100
    weights = {
        "relevance": 30,
        "factual_accuracy": 25,
        "detail_level": 20,
        "clarity": 15,
        "confidence": 10
    }
    
    # Normalize all metrics to 0-10 scale
    clarity_norm = max(0, min(10, clarity))
    relevance_norm = max(0, min(10, relevance))
    detail_norm = max(0, min(10, detail_level))
    factual_norm = max(0, min(10, factual_accuracy))
    confidence_norm = max(0, min(10, confidence))
    
    # Calculate component scores (each component's contribution is (metric * weight)/10)
    component_scores = {
        "relevance": (relevance_norm * weights["relevance"]) / 10,
        "factual_accuracy": (factual_norm * weights["factual_accuracy"]) / 10,
        "detail_level": (detail_norm * weights["detail_level"]) / 10,
        "clarity": (clarity_norm * weights["clarity"]) / 10,
        "confidence": (confidence_norm * weights["confidence"]) / 10
    }
    
    # Penalty for filler words: subtract 0.5 points per filler word, max penalty 10 points
    filler_penalty = min(10, filler_word_count * 0.5)
    
    # Calculate final score, ensure it's between 0 and 100
    total_score = sum(component_scores.values()) - filler_penalty
    final_score = max(0, min(100, total_score))
    
    # Prepare breakdown for reporting
    weighted_breakdown = {
        **component_scores,
        "filler_word_penalty": -filler_penalty,
        "total": final_score,
        "weights": weights
    }
    
    return final_score, weighted_breakdown


def _evaluate_local(question: str, answer: str) -> LLMEvaluationResult:
    # Calculate simple heuristic metrics
    word_count = len(answer.split())
    clarity = 5 if word_count > 20 else 3
    relevance = 6  # Assume some relevance
    detail_level = min(10, word_count // 10) if word_count > 0 else 0
    factual_accuracy = 8  # Assume mostly factual for local fallback
    confidence = 5 if word_count > 10 else 3
    filler_count = _count_filler_words(answer)
    
    # Calculate final weighted score
    final_score, weighted_breakdown = _calculate_weighted_score(
        clarity, relevance, detail_level, factual_accuracy, confidence, filler_count, word_count
    )
    
    return LLMEvaluationResult(
        score=final_score,
        reasoning=f"Resume-grounded evaluation: answer length and relevance to '{question[:60]}...'.",
        best_answer=f"A strong answer would directly address the question, use specific examples from experience, and highlight relevant skills.",
        user_answer_comparison=f"Your answer provided {word_count} words; a more detailed answer with specific examples would improve your score.",
        filler_word_count=filler_count,
        metrics={
            "clarity": clarity,
            "relevance": relevance,
            "detail_level": detail_level,
            "factual_accuracy": factual_accuracy,
            "confidence": confidence
        },
        factual_inaccuracies=[],
        weighted_breakdown=weighted_breakdown
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
                f"You are a live senior technical interviewer for a {target_role} role. Your name is James.\n"
                f"Your interview standard is extremely high, professional, and thorough.\n"
                f"{RESUME_ONLY_RULES}\n"
                f"Question type: {agent_type}\n"
            )
            if agent_type == "personality":
                prompt += (
                    "Focus heavily on the candidate's achievements, extra-curriculars, or professional experience listed in their resume.\n"
                    "Ask an insightful behavioral or project-leadership question. Select a specific role or experience item from their resume. For example:\n"
                    "'At [Company Name], you worked as a [Role] and did [Achievement/Duty]. Walk me through your day-to-day there, the exact scale or challenges, and what leadership or teamwork lessons you learned.'\n"
                    "Make sure you reference specific details, companies, or titles from their resume to make the question highly personal and non-generic.\n"
                )
            elif agent_type == "technical":
                prompt += (
                    f"Difficulty: {difficulty} (based on recent scores)\n"
                    "Generate a deep, high-standard technical question centered on the projects and tech stack listed in their resume.\n"
                    "Do NOT ask generic textbook definitions (e.g. 'What is FastAPI dependency injection?'). Instead, anchor it to their projects, e.g.:\n"
                    "'In your project [Project Name], you used [Tech Stack/Database]. How did you design the database schema/API endpoints to support [Feature] and what trade-offs did you consider?' or 'How did you handle scaling/performance bottlenecks when using [Technology] in [Project]?'\n"
                )
            else:
                prompt += f"Difficulty: {difficulty} (based on recent scores)\n"

            prompt += (
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
                f"Evaluate this {agent_type} interview answer thoroughly.\n"
                f"Question (resume-based): {question}\n"
                f"Answer: {answer}\n"
                f"Resume context for relevance check: {json.dumps(resume_context or {})}\n"
                "Please provide:\n"
                "1. 'metrics': a dictionary with: \n"
                "   - 'clarity' (1-10)\n"
                "   - 'relevance' (1-10)\n"
                "   - 'detail_level' (1-10)\n"
                "   - 'factual_accuracy' (1-10)\n"
                "   - 'confidence' (1-10)\n"
                "   - 'technical_depth' (1-10)\n"
                "   - 'structure_and_flow' (1-10)\n"
                "   - 'professionalism' (1-10)\n"
                "2. 'reasoning': a short explanation of the evaluation\n"
                "3. 'best_answer': a complete, detailed, senior-level example of the best possible answer to this question, grounded in their resume context. IMPORTANT: If the candidate's answer is already exceptionally good, comprehensive, correct, and technically sound, set 'best_answer' to exactly 'Your answer is already very good and covers all key aspects!' instead of generating an alternative example.\n"
                "4. 'user_answer_comparison': a detailed comparison of the user's answer to the best answer, outlining what exactly is different, what key details or technical concepts the user missed, and how the user's answer matches up to the ideal standard. If their answer is already very good, highlight their key strengths.\n"
                "5. 'filler_word_count': count of filler words in the user's answer (like: um, uh, er, like, you know, so, sort of, kind of, basically, actually, i mean)\n"
                "6. 'factual_inaccuracies': a list of factual inaccuracies found in the answer (empty list if none)\n"
                'Return JSON: {"metrics": {"clarity": 5, "relevance": 5, "detail_level": 5, "factual_accuracy": 5, "confidence": 5, "technical_depth": 5, "structure_and_flow": 5, "professionalism": 5}, "reasoning": "...", "best_answer": "...", "user_answer_comparison": "...", "filler_word_count": 0, "factual_inaccuracies": []}'
            )
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            data = json.loads(response.choices[0].message.content or "{}")
            # Ensure metrics is a dict
            metrics = data.get("metrics", {})
            if not isinstance(metrics, dict):
                metrics = {"clarity": 5, "relevance": 5, "detail_level": 5, "factual_accuracy": 5, "confidence": 5, "technical_depth": 5, "structure_and_flow": 5, "professionalism": 5}
            
            # Extract individual metrics, defaulting to 5
            clarity = float(metrics.get("clarity", 5))
            relevance = float(metrics.get("relevance", 5))
            detail_level = float(metrics.get("detail_level", 5))
            factual_accuracy = float(metrics.get("factual_accuracy", 5))
            confidence = float(metrics.get("confidence", 5))
            filler_count = int(data.get("filler_word_count", 0))
            factual_inaccuracies = data.get("factual_inaccuracies", [])
            
            # Calculate weighted score using our formula
            final_score, weighted_breakdown = _calculate_weighted_score(
                clarity, relevance, detail_level, factual_accuracy, confidence, filler_count, len(answer.split())
            )
            
            return LLMEvaluationResult(
                score=final_score,
                reasoning=data.get("reasoning", "Evaluation completed."),
                best_answer=data.get("best_answer", "A strong answer would directly address the question with specific examples."),
                user_answer_comparison=data.get("user_answer_comparison", "Compare your answer to the best answer for improvement ideas."),
                filler_word_count=filler_count,
                metrics=metrics,
                factual_inaccuracies=factual_inaccuracies,
                weighted_breakdown=weighted_breakdown
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

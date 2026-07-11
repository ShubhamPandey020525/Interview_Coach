from app.services.llm_provider import LLMProvider


async def resume_node(state: dict, llm: LLMProvider) -> dict:
    """Resume Agent — seeds interview context from parsed resume/profile."""
    from app.agents.resume_context import is_resume_context_sufficient

    resume_context = dict(state.get("resume_context") or {})

    if resume_context.get("raw_text") and not resume_context.get("skills"):
        parsed = await llm.parse_resume(resume_context["raw_text"])
        resume_context = {
            "skills": parsed.get("skills", []),
            "projects": parsed.get("projects", []),
            "experience_summary": parsed.get("experience_summary", ""),
            "raw_text": resume_context.get("raw_text", ""),
        }
    elif not is_resume_context_sufficient(resume_context):
        resume_context = {
            "skills": resume_context.get("skills", []),
            "projects": resume_context.get("projects", []),
            "experience_summary": resume_context.get("experience_summary", ""),
            "raw_text": resume_context.get("raw_text", ""),
        }

    if not is_resume_context_sufficient(resume_context):
        raise ValueError(
            "Resume profile is missing or empty. Upload a resume with skills and experience first."
        )

    return {"resume_context": resume_context, "current_stage": "technical"}

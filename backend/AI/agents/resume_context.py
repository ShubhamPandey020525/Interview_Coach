"""Resume context helpers — all interview content must be grounded in the candidate's resume."""

from AI.utils.resume_context import is_resume_context_sufficient



def resume_context_from_profile(profile, raw_text: str = "") -> dict:
    return {
        "skills": profile.skills or [],
        "projects": profile.projects or [],
        "experience_summary": profile.experience_summary or "",
        "raw_text": raw_text[:8000] if raw_text else "",
        "skill_subtopics": getattr(profile, "skill_subtopics", {}),
    }

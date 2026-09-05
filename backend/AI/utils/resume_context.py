"""Resume context validation utilities."""


def is_resume_context_sufficient(resume_context: dict | None) -> bool:
    if not resume_context:
        return False
    skills = resume_context.get("skills") or []
    projects = resume_context.get("projects") or []
    summary = (resume_context.get("experience_summary") or "").strip()
    raw_text = (resume_context.get("raw_text") or "").strip()
    return bool(skills or projects or len(summary) > 30 or len(raw_text) > 80)

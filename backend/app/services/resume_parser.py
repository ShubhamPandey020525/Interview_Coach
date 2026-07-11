import re

COMMON_SKILLS = {
    "python", "java", "javascript", "typescript", "react", "node", "nodejs", "sql",
    "fastapi", "django", "flask", "aws", "docker", "kubernetes", "git", "mongodb",
    "postgresql", "mysql", "redis", "html", "css", "c++", "c#", "golang", "go",
    "machine learning", "deep learning", "tensorflow", "pytorch", "nlp", "llm",
    "openai", "langchain", "langgraph", "rest", "api", "azure", "gcp", "linux",
    "spring", "angular", "vue", "nextjs", "express", "scala", "kotlin", "swift",
    "pandas", "numpy", "scikit-learn", "spark", "hadoop", "tableau", "power bi",
}


def extract_text_from_file(filepath: str, ext: str) -> str:
    try:
        if ext == ".pdf":
            from PyPDF2 import PdfReader

            reader = PdfReader(filepath)
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        if ext == ".docx":
            from docx import Document

            doc = Document(filepath)
            return "\n".join(p.text for p in doc.paragraphs)
    except Exception:
        return ""
    return ""


def parse_resume_locally(text: str) -> dict:
    """Fast local parser — no API call, returns in milliseconds."""
    lower = text.lower()
    found_skills: list[str] = []

    for skill in sorted(COMMON_SKILLS, key=len, reverse=True):
        if skill in lower:
            label = skill.title() if skill not in {"go", "c++", "c#", "nodejs", "nextjs"} else {
                "go": "Go", "c++": "C++", "c#": "C#", "nodejs": "Node.js", "nextjs": "Next.js"
            }[skill]
            if label not in found_skills:
                found_skills.append(label)

    # Lines that look like skill lists (comma/pipe separated)
    for line in text.splitlines():
        if re.search(r"\b(skills?|technologies|tech stack|tools)\b", line, re.I):
            parts = re.split(r"[,|•·/]", line)
            for part in parts:
                token = part.strip(" -:\t")
                if 2 < len(token) < 30 and token[0].isupper():
                    if token not in found_skills:
                        found_skills.append(token)

    projects: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 20:
            continue
        if re.search(r"\b(project|built|developed|designed|implemented)\b", line, re.I):
            projects.append({
                "name": line[:80],
                "description": line[:200],
                "tech_stack": found_skills[:5],
            })
            if len(projects) >= 4:
                break

    summary = " ".join(text.split())[:600]

    return {
        "skills": list(dict.fromkeys(found_skills))[:25],
        "projects": projects,
        "experience_summary": summary,
    }

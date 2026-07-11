import re


def strip_question_metadata(question: str) -> str:
    cleaned = re.sub(r"^\[(easy|medium|hard)\]\s*", "", question, flags=re.IGNORECASE)
    cleaned = re.sub(r"^Question\s+\d+:\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()

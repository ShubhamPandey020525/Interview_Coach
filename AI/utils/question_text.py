import re


def strip_question_metadata(question: str) -> str:
    if not question:
        return ""
    # Strip metadata tags like [medium], [AGENT: HR], Question 1:
    cleaned = re.sub(r"^\[(easy|medium|hard)\]\s*", "", question, flags=re.IGNORECASE)
    cleaned = re.sub(r"^Question\s+\d+:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[(AGENT|STAGE|TYPE):[^\]]+\]", "", cleaned, flags=re.IGNORECASE)
    # Remove markdown symbols (backticks, asterisks, hashes) without removing the text inside
    cleaned = re.sub(r"```", " ", cleaned)
    cleaned = re.sub(r"`", "", cleaned)
    cleaned = re.sub(r"[*#_~>]+", "", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()

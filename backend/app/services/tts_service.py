import logging
import re
from pathlib import Path
import edge_tts

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

VOICE_MAP = {
    "hr": "en-US-JennyNeural",
    "behavioral": "en-US-JennyNeural",
    "personality": "en-US-JennyNeural",
    "intro": "en-US-JennyNeural",
    "technical": "en-US-ChristopherNeural",
    "coding": "en-US-ChristopherNeural",
    "followup": "en-US-ChristopherNeural",
    "scenario": "en-US-EricNeural",
    "system_design": "en-US-EricNeural",
}

DEFAULT_VOICE = "en-US-JennyNeural"


def sanitize_text_for_speech(text: str) -> str:
    if not text:
        return ""
    # Strip metadata tags like [AGENT: HR], [STAGE: TECHNICAL]
    cleaned = re.sub(r"\[(AGENT|STAGE|TYPE):[^\]]+\]", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\[(easy|medium|hard)\]\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^Question\s+\d+:\s*", "", cleaned, flags=re.IGNORECASE)
    # Remove markdown links, keep label text
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    # Remove markdown code blocks and backtick characters without deleting the words inside
    cleaned = re.sub(r"```", " ", cleaned)
    cleaned = re.sub(r"`", "", cleaned)
    cleaned = re.sub(r"[*#_~>]+", "", cleaned)
    # Collapse extra whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


class TTSService:
    def __init__(self) -> None:
        self.tts_dir = Path(settings.media_root) / "tts"
        self.tts_dir.mkdir(parents=True, exist_ok=True)

    async def generate_question_audio(self, attempt_id: str, question_text: str, agent_type: str = "technical") -> str | None:
        """
        Generates realistic audio using Edge-TTS for an interview question.
        Returns the relative URL path (/media/tts/{attempt_id}.mp3) or None on failure.
        """
        spoken_text = sanitize_text_for_speech(question_text)
        if not spoken_text:
            return None

        filename = f"{attempt_id}.mp3"
        output_file = self.tts_dir / filename
        relative_path = f"/media/tts/{filename}"

        # If file already generated, return path immediately
        if output_file.exists() and output_file.stat().st_size > 0:
            return relative_path

        voice = VOICE_MAP.get(agent_type.lower(), DEFAULT_VOICE)

        try:
            communicate = edge_tts.Communicate(spoken_text, voice)
            await communicate.save(str(output_file))
            logger.info("Generated Edge-TTS audio for attempt %s using voice %s", attempt_id, voice)
            return relative_path
        except Exception as e:
            logger.warning("Edge-TTS audio generation failed for attempt %s: %s. Trying gTTS fallback...", attempt_id, e)
            try:
                from gtts import gTTS
                tts = gTTS(text=spoken_text, lang="en")
                tts.save(str(output_file))
                logger.info("Generated gTTS fallback audio for attempt %s", attempt_id)
                return relative_path
            except Exception as fallback_err:
                logger.error("gTTS fallback audio generation failed for attempt %s: %s", attempt_id, fallback_err)
                if output_file.exists():
                    try:
                        output_file.unlink()
                    except Exception:
                        pass
                return None

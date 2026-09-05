import asyncio
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
    "james": "en-US-ChristopherNeural",
    "technical": "en-US-ChristopherNeural",
    "coding": "en-US-ChristopherNeural",
    "followup": "en-US-ChristopherNeural",
    "scenario": "en-US-EricNeural",
    "system_design": "en-US-EricNeural",
}

DEFAULT_VOICE = "en-US-JennyNeural"

FALLBACK_VOICES = [
    "en-US-ChristopherNeural",
    "en-US-EricNeural",
    "en-US-JennyNeural",
    "en-US-GuyNeural",
    "en-US-AriaNeural",
    "en-GB-SoniaNeural",
    "en-GB-RyanNeural",
]

MIN_MP3_BYTES = 1024


def sanitize_text_for_speech(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"\[(AGENT|STAGE|TYPE):[^\]]+\]", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"^\[(easy|medium|hard)\]\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^Question\s+\d+:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"```", " ", cleaned)
    cleaned = re.sub(r"`", "", cleaned)
    cleaned = re.sub(r"[*#_~>]+", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > 2000:
        cleaned = cleaned[:2000].rsplit(" ", 1)[0] + "..."
    return cleaned


def _validate_mp3(path: Path) -> bool:
    try:
        if not path.exists():
            return False
        size = path.stat().st_size
        if size < MIN_MP3_BYTES:
            return False
        with open(path, "rb") as fh:
            head = fh.read(16)
        if not head:
            return False
        if head.startswith(b"\xff\xfb") or head.startswith(b"\xff\xf3") or head.startswith(b"\xff\xf2"):
            return True
        if head.startswith(b"ID3"):
            return True
        return size >= MIN_MP3_BYTES * 2
    except Exception:
        return False


class TTSService:
    def __init__(self) -> None:
        self.tts_dir = Path(settings.media_root) / "tts"
        self.tts_dir.mkdir(parents=True, exist_ok=True)

    async def generate_question_audio(self, attempt_id: str, question_text: str, agent_type: str = "technical") -> str | None:
        spoken_text = sanitize_text_for_speech(question_text)
        if not spoken_text:
            return None

        filename = f"{attempt_id}.mp3"
        output_file = self.tts_dir / filename
        relative_path = f"/media/tts/{filename}"

        if output_file.exists() and _validate_mp3(output_file):
            return relative_path

        voice = VOICE_MAP.get(agent_type.lower(), DEFAULT_VOICE)
        voice_choices = [voice] + [v for v in FALLBACK_VOICES if v != voice]

        last_err = None
        for candidate in voice_choices[:3]:
            try:
                communicate = edge_tts.Communicate(spoken_text, candidate)
                try:
                    await asyncio.wait_for(communicate.save(str(output_file)), timeout=60)
                except asyncio.TimeoutError:
                    last_err = TimeoutError(f"edge-tts {candidate} timed out")
                    if output_file.exists():
                        try:
                            output_file.unlink()
                        except Exception:
                            pass
                    continue
                if _validate_mp3(output_file):
                    logger.info("Generated Edge-TTS audio for attempt %s using voice %s", attempt_id, candidate)
                    return relative_path
                if output_file.exists():
                    try:
                        output_file.unlink()
                    except Exception:
                        pass
            except Exception as e:
                last_err = e
                if output_file.exists():
                    try:
                        output_file.unlink()
                    except Exception:
                        pass

        logger.warning("Edge-TTS audio generation failed for attempt %s: %s. Trying gTTS fallback...", attempt_id, last_err)
        try:
            from gtts import gTTS
            tts = gTTS(text=spoken_text, lang="en", slow=False)
            try:
                await asyncio.wait_for(asyncio.to_thread(tts.save, str(output_file)), timeout=45)
            except asyncio.TimeoutError:
                raise TimeoutError("gTTS save timed out")
            if _validate_mp3(output_file):
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

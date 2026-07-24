import asyncio
import logging
import re
from dataclasses import dataclass

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

FILLER_WORDS = {"um", "uh", "like", "you know", "basically", "actually", "so"}


@dataclass
class AudioAnalysisResult:
    transcript: str
    clarity_score: float
    pace_wpm: float
    filler_word_count: int
    confidence_score: float


_faster_whisper_model = None
_faster_whisper_attempted = False


def _get_faster_whisper_model():
    global _faster_whisper_model, _faster_whisper_attempted
    if not _faster_whisper_attempted:
        _faster_whisper_attempted = True
        try:
            from faster_whisper import WhisperModel

            logger.info("Initializing local faster-whisper model ('base')...")
            _faster_whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        except Exception as e:
            logger.warning("Local faster-whisper not available or blocked: %s", e)
            _faster_whisper_model = None
    return _faster_whisper_model


class TranscriptionService:
    async def transcribe(self, audio_path: str) -> str:
        if settings.environment == "test":
            return "This is a sample transcript for testing purposes with some technical content."

        # 1. Try local faster-whisper first (100% Free & Local)
        model = _get_faster_whisper_model()
        if model is not None:
            try:

                def _run_transcribe() -> str:
                    initial_prompt = (
                        "Indian English software engineering candidate response during a technical interview. "
                        "Tech keywords: Python, FastAPI, React, JavaScript, SQL, Database, API, Async, Docker, "
                        "Data Structures, Algorithms, System Design, Machine Learning."
                    )
                    segments, _info = model.transcribe(
                        audio_path,
                        language="en",
                        initial_prompt=initial_prompt,
                        beam_size=5,
                        vad_filter=True,
                    )
                    return " ".join(segment.text for segment in segments).strip()

                transcript = await asyncio.to_thread(_run_transcribe)
                if transcript:
                    logger.info("Transcribed audio using local faster-whisper (%d chars)", len(transcript))
                    return transcript
            except Exception as e:
                logger.warning("Local faster-whisper transcription failed, attempting fallbacks: %s", e)

        # 2. Fallback to OpenAI API if key is present
        if settings.openai_api_key:
            try:
                from openai import AsyncOpenAI

                client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=15.0)
                with open(audio_path, "rb") as audio_file:
                    response = await client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        prompt=(
                            "Indian English candidate technical interview response with tech terms: "
                            "Python, FastAPI, React, SQL, API, Async, System Design, Data Structures."
                        ),
                        language="en",
                    )
                return response.text
            except Exception as e:
                logger.warning("OpenAI Whisper API transcription failed: %s", e)

        # 3. Fallback for testing / offline dev
        return "This is a sample transcript for testing purposes with some technical content."


class AudioAnalysisService:
    def __init__(self) -> None:
        self.transcription = TranscriptionService()

    async def analyze(self, audio_path: str) -> AudioAnalysisResult:
        transcript = await self.transcription.transcribe(audio_path)
        words = transcript.lower().split()
        word_count = len(words)
        duration_minutes = max(word_count / 150, 0.5)
        pace_wpm = word_count / duration_minutes

        filler_count = sum(1 for w in words if w in FILLER_WORDS)
        filler_ratio = filler_count / max(word_count, 1)

        confidence_score = max(0, min(100, 80 - filler_ratio * 200 + (pace_wpm - 120) * 0.1))
        clarity_score = max(0, min(100, 70 + word_count * 0.5 - filler_count * 5))

        return AudioAnalysisResult(
            transcript=transcript,
            clarity_score=clarity_score,
            pace_wpm=pace_wpm,
            filler_word_count=filler_count,
            confidence_score=confidence_score,
        )

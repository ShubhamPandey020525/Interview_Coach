import re
from dataclasses import dataclass

from app.config import get_settings

settings = get_settings()

FILLER_WORDS = {"um", "uh", "like", "you know", "basically", "actually", "so"}


@dataclass
class AudioAnalysisResult:
    transcript: str
    clarity_score: float
    pace_wpm: float
    filler_word_count: int
    confidence_score: float


class TranscriptionService:
    async def transcribe(self, audio_path: str) -> str:
        if settings.environment == "test" or not settings.openai_api_key:
            return "This is a sample transcript for testing purposes with some technical content."

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=15.0)
        with open(audio_path, "rb") as audio_file:
            response = await client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                prompt="Um, uh, er, like, you know, basically, actually, so... this is a candidate response with filler words.",
            )
        return response.text


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

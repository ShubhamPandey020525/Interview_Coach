from dataclasses import dataclass

from app.services.transcription_service import AudioAnalysisService


@dataclass
class AudioAgentResult:
    transcript: str
    clarity_score: float
    pace_wpm: float
    filler_word_count: int
    confidence_score: float
    signals: list[dict]


async def audio_analysis_node(audio_path: str) -> AudioAgentResult:
    """Audio Analysis Agent — transcription + clarity/pace/confidence signals."""
    service = AudioAnalysisService()
    result = await service.analyze(audio_path)
    signals = [
        {
            "type": "communication",
            "score": result.clarity_score,
            "notes": (
                f"Clarity analysis from transcript. Speaking pace: {result.pace_wpm:.0f} WPM. "
                f"Filler words detected: {result.filler_word_count}."
            ),
        },
        {
            "type": "confidence",
            "score": result.confidence_score,
            "notes": (
                "Confidence proxy from pace consistency and filler-word ratio. "
                "This is an estimate, not a clinical measurement."
            ),
        },
    ]
    return AudioAgentResult(
        transcript=result.transcript,
        clarity_score=result.clarity_score,
        pace_wpm=result.pace_wpm,
        filler_word_count=result.filler_word_count,
        confidence_score=result.confidence_score,
        signals=signals,
    )

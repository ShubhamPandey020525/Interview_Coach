from dataclasses import dataclass

from app.services.video_analysis_service import VideoAnalysisService


@dataclass
class VideoAgentResult:
    face_present_ratio: float
    estimated_eye_contact_ratio: float
    posture_stability: float
    engagement_score: float
    signals: list[dict]


def video_analysis_node(video_path: str) -> VideoAgentResult:
    """Video Analysis Agent — engagement proxies from sampled frames."""
    service = VideoAnalysisService()
    result = service.analyze(video_path)
    signals = [
        {
            "type": "engagement",
            "score": result.engagement_score,
            "notes": (
                f"Estimated engagement from video proxies: face present {result.face_present_ratio:.0%}, "
                f"estimated eye contact {result.estimated_eye_contact_ratio:.0%}, "
                f"posture stability {result.posture_stability:.0%}."
            ),
        }
    ]
    return VideoAgentResult(
        face_present_ratio=result.face_present_ratio,
        estimated_eye_contact_ratio=result.estimated_eye_contact_ratio,
        posture_stability=result.posture_stability,
        engagement_score=result.engagement_score,
        signals=signals,
    )

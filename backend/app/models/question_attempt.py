import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview_sessions.id"), index=True, nullable=False)
    agent_type: Mapped[str] = mapped_column(
        Enum("technical", "followup", "scenario", "personality", name="agent_type"),
        nullable=False,
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    video_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    best_answer: Mapped[str | None] = mapped_column(Text, nullable=True)  # New field for example best answer
    user_answer_comparison: Mapped[str | None] = mapped_column(Text, nullable=True)  # New field for comparison
    filler_word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)  # New field for filler count
    metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # New field for metrics dict
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["InterviewSession"] = relationship(back_populates="attempts")
    evaluation_signals: Mapped[list["EvaluationSignal"]] = relationship(back_populates="attempt")

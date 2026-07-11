import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EvaluationSignal(Base):
    __tablename__ = "evaluation_signals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("question_attempts.id"), index=True, nullable=False)
    type: Mapped[str] = mapped_column(
        Enum("technical", "confidence", "communication", "engagement", name="signal_type"),
        nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    attempt: Mapped["QuestionAttempt"] = relationship(back_populates="evaluation_signals")

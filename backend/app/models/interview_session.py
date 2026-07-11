import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    target_role: Mapped[str] = mapped_column(String(255), nullable=False)
    session_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Interview")
    status: Mapped[str] = mapped_column(
        Enum("created", "in_progress", "completed", "cancelled", name="session_status"),
        default="created",
        nullable=False,
    )
    current_stage: Mapped[str] = mapped_column(String(64), default="technical")
    start_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="sessions")
    attempts: Mapped[list["QuestionAttempt"]] = relationship(back_populates="session")
    learning_plans: Mapped[list["LearningPlan"]] = relationship(back_populates="session")

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("candidate", "admin", "institute_admin", "recruiter", name="user_role"),
        default="candidate",
        nullable=False,
    )
    experience_level: Mapped[str | None] = mapped_column(
        Enum("student", "fresher", "junior", "mid", "senior", "architect", name="experience_level"),
        nullable=True,
    )
    target_role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    resume_profiles: Mapped[list["ResumeProfile"]] = relationship(back_populates="user")
    sessions: Mapped[list["InterviewSession"]] = relationship(back_populates="user")
    learning_plans: Mapped[list["LearningPlan"]] = relationship(back_populates="user")
    progress_history: Mapped[list["ProgressHistory"]] = relationship(back_populates="user")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user")

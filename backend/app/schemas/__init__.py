from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorDetail


# Auth schemas
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8)
    target_role: str | None = None
    experience_level: Literal["student", "fresher", "junior", "mid", "senior", "architect"] | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: UUID
    name: str
    email: str
    role: str
    experience_level: str | None = None
    target_role: str | None = None
    is_active: bool = True
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    target_role: str | None = None
    experience_level: Literal["student", "fresher", "junior", "mid", "senior", "architect"] | None = None


# Resume schemas
class ResumeProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    raw_file_path: str
    skills: list[str]
    projects: list[dict]
    experience_summary: str | None
    parsed_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


# Session schemas
class SessionCreateRequest(BaseModel):
    session_name: str = Field(min_length=1, max_length=255)
    target_role: str | None = None


class SessionResponse(BaseModel):
    id: UUID
    user_id: UUID
    target_role: str
    session_name: str
    status: str
    current_stage: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NextQuestionResponse(BaseModel):
    attempt_id: UUID
    agent_type: str
    question_text: str
    sequence_number: int


class EvaluationSignalResponse(BaseModel):
    type: str
    score: float
    notes: str

    model_config = {"from_attributes": True}


class AnswerResponse(BaseModel):
    attempt_id: UUID
    score: float | None = None
    evaluation_signals: list[EvaluationSignalResponse] = Field(default_factory=list)
    status: str | None = None


class AttemptResponse(BaseModel):
    id: UUID
    session_id: UUID
    agent_type: str
    question_text: str
    answer_text: str | None
    audio_ref: str | None
    video_ref: str | None
    transcript: str | None
    score: float | None
    sequence_number: int
    created_at: datetime
    evaluation_signals: list[EvaluationSignalResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int


# Report schemas
class ReportAttemptSummary(BaseModel):
    attempt_id: UUID
    question_text: str
    score: float | None
    agent_type: str


class LearningPlanSummary(BaseModel):
    weak_areas: list[str]
    recommended_resources: list[dict]


class SessionReportResponse(BaseModel):
    session_id: UUID
    overall_score: float
    strengths: list[str]
    weaknesses: list[str]
    attempts: list[ReportAttemptSummary]
    learning_plan: LearningPlanSummary


class LearningPlanResponse(BaseModel):
    id: UUID
    user_id: UUID
    session_id: UUID | None
    weak_areas: list[str]
    recommended_resources: list[dict]
    created_at: datetime

    model_config = {"from_attributes": True}


class ProgressSessionItem(BaseModel):
    session_id: UUID
    date: datetime
    overall_score: float


class ProgressResponse(BaseModel):
    user_id: UUID
    sessions: list[ProgressSessionItem]
    trend_metrics: dict[str, list[float]]


class MediaUploadResponse(BaseModel):
    file_path: str
    message: str = "File uploaded successfully"


class HealthResponse(BaseModel):
    status: str
    environment: str

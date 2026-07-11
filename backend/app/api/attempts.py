import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.exceptions import AppException
from app.database import get_db
from app.models.interview_session import InterviewSession
from app.models.question_attempt import QuestionAttempt
from app.models.user import User
from app.schemas import AttemptResponse, EvaluationSignalResponse, PaginatedResponse

router = APIRouter(tags=["attempts"])


async def _verify_attempt_access(db: AsyncSession, attempt_id: uuid.UUID, user: User) -> QuestionAttempt:
    result = await db.execute(
        select(QuestionAttempt)
        .where(QuestionAttempt.id == attempt_id)
        .options(selectinload(QuestionAttempt.evaluation_signals), selectinload(QuestionAttempt.session))
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise AppException("ATTEMPT_NOT_FOUND", "Question attempt not found.", 404)
    if attempt.session.user_id != user.id and user.role not in ("admin", "institute_admin"):
        raise AppException("FORBIDDEN", "You do not have access to this attempt.", 403)
    return attempt


@router.get("/api/sessions/{session_id}/attempts", response_model=PaginatedResponse)
async def list_attempts(
    session_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session_result = await db.execute(select(InterviewSession).where(InterviewSession.id == session_id))
    session = session_result.scalar_one_or_none()
    if not session:
        raise AppException("SESSION_NOT_FOUND", "Interview session not found.", 404)
    if session.user_id != user.id:
        raise AppException("NOT_SESSION_OWNER", "You do not have access to this session.", 403)

    offset = (page - 1) * page_size
    count_result = await db.execute(
        select(func.count()).select_from(QuestionAttempt).where(QuestionAttempt.session_id == session_id)
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(QuestionAttempt)
        .where(QuestionAttempt.session_id == session_id)
        .options(selectinload(QuestionAttempt.evaluation_signals))
        .order_by(QuestionAttempt.sequence_number)
        .offset(offset)
        .limit(page_size)
    )
    attempts = result.scalars().all()
    items = []
    for a in attempts:
        resp = AttemptResponse.model_validate(a)
        resp.evaluation_signals = [EvaluationSignalResponse.model_validate(s) for s in a.evaluation_signals]
        items.append(resp)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/api/attempts/{attempt_id}", response_model=AttemptResponse)
async def get_attempt(
    attempt_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    attempt = await _verify_attempt_access(db, attempt_id, user)
    resp = AttemptResponse.model_validate(attempt)
    resp.evaluation_signals = [EvaluationSignalResponse.model_validate(s) for s in attempt.evaluation_signals]
    return resp

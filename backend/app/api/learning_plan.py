import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.exceptions import AppException
from app.database import get_db
from app.models.learning_plan import LearningPlan
from app.models.progress_history import ProgressHistory
from app.models.user import User
from app.schemas import LearningPlanResponse, ProgressResponse, ProgressSessionItem

router = APIRouter(tags=["learning-plan", "progress"])


@router.get("/api/users/{user_id}/learning-plan", response_model=LearningPlanResponse)
async def get_user_learning_plan(
    user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.id != user_id and user.role not in ("admin", "institute_admin"):
        raise AppException("FORBIDDEN", "Insufficient permissions.", 403)

    result = await db.execute(
        select(LearningPlan)
        .where(LearningPlan.user_id == user_id)
        .order_by(LearningPlan.created_at.desc())
        .limit(1)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise AppException("LEARNING_PLAN_NOT_FOUND", "No learning plan found.", 404)
    return LearningPlanResponse.model_validate(plan)


@router.get("/api/sessions/{session_id}/learning-plan", response_model=LearningPlanResponse)
async def get_session_learning_plan(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LearningPlan)
        .where(LearningPlan.session_id == session_id)
        .order_by(LearningPlan.created_at.desc())
        .limit(1)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise AppException("LEARNING_PLAN_NOT_FOUND", "No learning plan found for this session.", 404)
    if plan.user_id != user.id and user.role not in ("admin", "institute_admin"):
        raise AppException("FORBIDDEN", "Insufficient permissions.", 403)
    return LearningPlanResponse.model_validate(plan)


@router.get("/api/users/{user_id}/progress", response_model=ProgressResponse)
async def get_user_progress(
    user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.id != user_id and user.role not in ("admin", "institute_admin"):
        raise AppException("FORBIDDEN", "Insufficient permissions.", 403)

    result = await db.execute(
        select(ProgressHistory)
        .where(ProgressHistory.user_id == user_id)
        .order_by(ProgressHistory.created_at)
    )
    history = result.scalars().all()

    sessions = [
        ProgressSessionItem(
            session_id=h.session_id,
            date=h.created_at,
            overall_score=h.overall_score,
        )
        for h in history
    ]

    trend_metrics: dict[str, list[float]] = {
        "technical": [],
        "communication": [],
        "confidence": [],
        "engagement": [],
    }
    for h in history:
        for key in trend_metrics:
            val = h.trend_metrics.get(key, 0) if h.trend_metrics else 0
            if val:
                trend_metrics[key].append(val)

    return ProgressResponse(user_id=user_id, sessions=sessions, trend_metrics=trend_metrics)

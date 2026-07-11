import uuid

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.exceptions import AppException
from app.store import _in_memory_sessions, _in_memory_attempts, MockUser as User
from app.schemas import AttemptResponse, EvaluationSignalResponse, PaginatedResponse

router = APIRouter(tags=["attempts"])


async def _verify_attempt_access(attempt_id: uuid.UUID, user: User):
    attempt = _in_memory_attempts.get(attempt_id)
    if not attempt:
        raise AppException("ATTEMPT_NOT_FOUND", "Question attempt not found.", 404)
    session = _in_memory_sessions.get(attempt.session_id)
    if not session:
        raise AppException("SESSION_NOT_FOUND", "Interview session not found.", 404)
    if session.user_id != user.id and getattr(user, 'role', 'user') not in ("admin", "institute_admin"):
        raise AppException("FORBIDDEN", "You do not have access to this attempt.", 403)
    return attempt, session


@router.get("/api/sessions/{session_id}/attempts", response_model=PaginatedResponse)
async def list_attempts(
    session_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
):
    session = _in_memory_sessions.get(session_id)
    if not session:
        raise AppException("SESSION_NOT_FOUND", "Interview session not found.", 404)
    if session.user_id != user.id:
        raise AppException("NOT_SESSION_OWNER", "You do not have access to this session.", 403)

    attempts = [a for a in _in_memory_attempts.values() if a.session_id == session_id]
    attempts.sort(key=lambda a: a.sequence_number)

    offset = (page - 1) * page_size
    paginated = attempts[offset : offset + page_size]

    items = []
    for a in paginated:
        resp = AttemptResponse.model_validate(a)
        resp.evaluation_signals = [EvaluationSignalResponse.model_validate(s) for s in getattr(a, "evaluation_signals", [])]
        items.append(resp)

    return PaginatedResponse(items=items, total=len(attempts), page=page, page_size=page_size)


@router.get("/api/attempts/{attempt_id}", response_model=AttemptResponse)
async def get_attempt(
    attempt_id: uuid.UUID,
    user: User = Depends(get_current_user),
):
    attempt, session = await _verify_attempt_access(attempt_id, user)
    resp = AttemptResponse.model_validate(attempt)
    resp.evaluation_signals = [EvaluationSignalResponse.model_validate(s) for s in getattr(attempt, "evaluation_signals", [])]
    return resp

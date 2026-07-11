import uuid
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.security import verify_access_token
from app.database import get_db
from app.models.user import User


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise AppException("UNAUTHORIZED", "Authentication required.", 401)

    token = authorization.split(" ", 1)[1]
    payload = verify_access_token(token)
    if not payload:
        raise AppException("UNAUTHORIZED", "Invalid or expired token.", 401)

    user_id = payload.get("sub")
    if not user_id:
        raise AppException("UNAUTHORIZED", "Invalid token payload.", 401)

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise AppException("UNAUTHORIZED", "User not found.", 401)
    if not user.is_active:
        raise AppException("ACCOUNT_INACTIVE", "This account has been deactivated.", 403)
    return user


def require_role(*roles: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        allowed = set(roles) | {"admin"}
        if user.role not in allowed:
            raise AppException("FORBIDDEN", "Insufficient permissions.", 403)
        return user

    return _check

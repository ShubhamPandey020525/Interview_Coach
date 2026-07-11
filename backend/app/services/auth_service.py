import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
    verify_refresh_token,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas import AuthResponse, TokenResponse, UserResponse


class AuthService:
    @staticmethod
    async def register(
        db: AsyncSession,
        name: str,
        email: str,
        password: str,
        target_role: str | None = None,
        experience_level: str | None = None,
    ) -> AuthResponse:
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            raise AppException("EMAIL_ALREADY_EXISTS", "A user with this email already exists.", 409)

        user = User(
            name=name,
            email=email,
            hashed_password=hash_password(password),
            target_role=target_role,
            experience_level=experience_level,
        )
        db.add(user)
        await db.flush()

        access_token, refresh_token = await AuthService._issue_tokens(db, user)
        return AuthResponse(
            user=UserResponse.model_validate(user),
            access_token=access_token,
            refresh_token=refresh_token,
        )

    @staticmethod
    async def login(db: AsyncSession, email: str, password: str) -> AuthResponse:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.hashed_password):
            raise AppException("INVALID_CREDENTIALS", "Invalid email or password.", 401)

        if not user.is_active:
            raise AppException("ACCOUNT_INACTIVE", "This account has been deactivated.", 403)

        access_token, refresh_token = await AuthService._issue_tokens(db, user)
        return AuthResponse(
            user=UserResponse.model_validate(user),
            access_token=access_token,
            refresh_token=refresh_token,
        )

    @staticmethod
    async def refresh(db: AsyncSession, refresh_token: str) -> TokenResponse:
        payload = verify_refresh_token(refresh_token)
        if not payload:
            raise AppException("INVALID_TOKEN", "Invalid or expired refresh token.", 401)

        token_hash = hash_token(refresh_token)
        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked.is_(False),
            )
        )
        stored = result.scalar_one_or_none()

        if not stored or stored.expires_at < datetime.utcnow():
            raise AppException("INVALID_TOKEN", "Invalid or expired refresh token.", 401)

        user_id = payload.get("sub")
        result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise AppException("INVALID_TOKEN", "Invalid or expired refresh token.", 401)

        access_token = create_access_token({"sub": str(user.id)})
        new_refresh = create_refresh_token({"sub": str(user.id)})
        stored.revoked = True
        db.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_token(new_refresh),
                expires_at=datetime.utcnow() + timedelta(days=7),
            )
        )
        return TokenResponse(access_token=access_token, refresh_token=new_refresh)

    @staticmethod
    async def logout(db: AsyncSession, refresh_token: str) -> None:
        token_hash = hash_token(refresh_token)
        result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        stored = result.scalar_one_or_none()
        if stored:
            stored.revoked = True

    @staticmethod
    async def _issue_tokens(db: AsyncSession, user: User) -> tuple[str, str]:
        access_token = create_access_token({"sub": str(user.id)})
        refresh_token = create_refresh_token({"sub": str(user.id)})
        db.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_token(refresh_token),
                expires_at=datetime.utcnow() + timedelta(days=7),
            )
        )
        return access_token, refresh_token

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.schemas import LogoutRequest, RefreshRequest, RegisterRequest, LoginRequest, AuthResponse, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    return await AuthService.register(
        db, body.name, body.email, body.password, body.target_role, body.experience_level
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await AuthService.login(db, body.email, body.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await AuthService.refresh(db, body.refresh_token)


@router.post("/logout", status_code=204)
async def logout(
    body: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await AuthService.logout(db, body.refresh_token)

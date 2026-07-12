import logging
from fastapi import APIRouter, Depends
from app.api.deps import get_current_user
from app.store import MockUser as User, _in_memory_users
from app.schemas import UserResponse, UserUpdateRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user

@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    user: User = Depends(get_current_user)
):
    if body.name is not None:
        user.name = body.name
    if body.target_role is not None:
        user.target_role = body.target_role
    if body.experience_level is not None:
        user.experience_level = body.experience_level
    
    # Ensure it's persisted in the global memory dictionary
    _in_memory_users[user.id] = user
    return user

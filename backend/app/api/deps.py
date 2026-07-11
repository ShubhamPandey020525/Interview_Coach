import uuid
from typing import Annotated
from fastapi import Header
from app.store import MockUser, DEMO_USER_ID, _in_memory_users

async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> MockUser:
    # Always return the seeded demo user instantly
    return _in_memory_users[DEMO_USER_ID]

def require_role(*roles: str):
    async def _check() -> MockUser:
        return _in_memory_users[DEMO_USER_ID]
    return _check

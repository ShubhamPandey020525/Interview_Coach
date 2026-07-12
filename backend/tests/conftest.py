import asyncio
import os
import uuid
from collections.abc import AsyncGenerator

os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only"
os.environ["OPENAI_API_KEY"] = ""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.api.deps import get_current_user
from app.store import MockUser

from typing import Annotated
from fastapi import Header

async def override_get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> MockUser:
    from app.store import _in_memory_users, DEMO_USER_ID
    if not authorization or not authorization.startswith("Bearer "):
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Unauthorized")
    return _in_memory_users[DEMO_USER_ID]

app.dependency_overrides[get_current_user] = override_get_current_user


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from app.agents import graph as graph_module
    from app.store import _in_memory_sessions, _in_memory_attempts, _in_memory_resumes, _in_memory_learning_plans
    
    graph_module._session_states.clear()
    graph_module._graph_instance = None
    
    _in_memory_sessions.clear()
    _in_memory_attempts.clear()
    _in_memory_resumes.clear()
    _in_memory_learning_plans.clear()
    yield


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def authenticated_client(client: AsyncClient) -> AsyncClient:
    from app.store import DEMO_USER_ID, _in_memory_users
    
    # Update demo user name to match test expectations
    _in_memory_users[DEMO_USER_ID].name = "Test User"
    
    client.headers["Authorization"] = "Bearer test_token"
    setattr(client, "_user", {
        "id": str(DEMO_USER_ID),
        "name": "Test User",
        "email": "demo@example.com",
    })
    return client


@pytest_asyncio.fixture
async def authenticated_client_with_resume(authenticated_client: AsyncClient) -> AsyncClient:
    from app.store import DEMO_USER_ID, _in_memory_resumes, InMemoryModel
    from datetime import datetime
    
    profile = InMemoryModel(
        id=uuid.uuid4(),
        user_id=DEMO_USER_ID,
        raw_file_path="resumes/test-fixture.pdf",
        skills=["Python", "FastAPI", "SQLAlchemy"],
        projects=[
            {
                "name": "Interview Coach API",
                "description": "Built async REST API with multi-agent orchestration",
                "tech_stack": ["Python", "FastAPI", "LangGraph"],
            }
        ],
        experience_summary="Backend engineer with Python, FastAPI, and database experience.",
        skill_subtopics={
            "Python": ["decorators", "generators", "multithreading"],
            "FastAPI": ["dependency injection", "pydantic validation"],
            "SQLAlchemy": ["ORM", "sessions", "migrations"]
        },
        parsed_at=datetime.utcnow(),
        created_at=datetime.utcnow()
    )
    _in_memory_resumes[DEMO_USER_ID] = profile
    return authenticated_client

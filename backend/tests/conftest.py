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
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    from app.agents import graph as graph_module

    graph_module._session_states.clear()
    graph_module._graph_instance = None
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def authenticated_client(client: AsyncClient) -> AsyncClient:
    resp = await client.post(
        "/api/auth/register",
        json={
            "name": "Test User",
            "email": f"test-{uuid.uuid4().hex[:8]}@example.com",
            "password": "password123",
            "target_role": "Software Engineer",
            "experience_level": "junior",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    client.headers["Authorization"] = f"Bearer {data['access_token']}"
    client._refresh_token = data["refresh_token"]  # type: ignore[attr-defined]
    client._user = data["user"]  # type: ignore[attr-defined]
    return client


@pytest_asyncio.fixture
async def authenticated_client_with_resume(authenticated_client: AsyncClient) -> AsyncClient:
    from app.models.resume_profile import ResumeProfile

    data = authenticated_client._user  # type: ignore[attr-defined]
    async with TestSessionLocal() as db:
        db.add(
            ResumeProfile(
                user_id=uuid.UUID(data["id"]),
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
            )
        )
        await db.commit()

    return authenticated_client

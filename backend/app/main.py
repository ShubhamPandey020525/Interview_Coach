from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import attempts, auth, health, learning_plan, media, profile, sessions, users, ws
from app.config import get_settings
from app.core.exceptions import AppException, RequestIDMiddleware, app_exception_handler, generic_exception_handler
from app.database import Base, engine

settings = get_settings()


def _ensure_session_name_column(sync_conn) -> None:
    if "sqlite" not in settings.database_url:
        return
    rows = sync_conn.execute(text("PRAGMA table_info(interview_sessions)")).fetchall()
    if any(row[1] == "session_name" for row in rows):
        return
    sync_conn.execute(
        text(
            "ALTER TABLE interview_sessions ADD COLUMN session_name VARCHAR(255) NOT NULL DEFAULT 'Interview'"
        )
    )
    sync_conn.execute(
        text("UPDATE interview_sessions SET session_name = target_role WHERE session_name = 'Interview'")
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_session_name_column)
    yield


app = FastAPI(title="AI Technical Interview Coach", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(profile.router)
app.include_router(sessions.router)
app.include_router(attempts.router)
app.include_router(learning_plan.router)
app.include_router(media.router)
app.include_router(ws.router)

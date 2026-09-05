from contextlib import asynccontextmanager
import os
import sys
import logging
import multiprocessing as _mp

try:
    if sys.platform.startswith("win") and hasattr(_mp, "freeze_support"):
        try:
            _mp.freeze_support()
        except Exception:
            pass
except Exception:
    pass

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import FileResponse

try:
    from app.api import attempts, health, media, profile, sessions, users, ws
except Exception as _import_err:
    logging.getLogger("uvicorn.error").warning("Router import fallback: %s", _import_err)
    from app.api import health as health  # noqa: F811
    attempts = health
    media = health
    profile = health
    sessions = health
    users = health
    ws = health

from app.config import get_settings
from app.core.exceptions import (
    AppException,
    RequestIDMiddleware,
    app_exception_handler,
    generic_exception_handler,
)

settings = get_settings()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn.error")


class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if isinstance(response, FileResponse):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            response.headers["Accept-Ranges"] = "bytes"
        return response


class EdgeCompatibilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "")
        referer = request.headers.get("referer", "")
        ua = (request.headers.get("user-agent", "") or "").lower()
        is_edge_like = (
            "edg/" in ua
            or "edga/" in ua
            or "edgios/" in ua
            or "edge/" in ua
            or origin in ("null", "file://")
            or referer.startswith("file://")
        )
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.warning("Edge compat middleware caught upstream error: %s", exc)
            raise
        if is_edge_like:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            response.headers["X-Content-Type-Options"] = "nosniff"
            acao = response.headers.get("access-control-allow-origin")
            if not acao and origin:
                allowed = settings.cors_origins
                if origin in allowed or "*" in allowed:
                    response.headers["access-control-allow-origin"] = origin
                    response.headers["access-control-allow-credentials"] = "true"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="AI Technical Interview Coach", lifespan=lifespan)


# Session middleware for cross-request consistency (Edge benefits from secure session cookies)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="interview_session",
    same_site="lax",
    https_only=False,
    max_age=86400,
)

# CORS must be permissive enough for Edge (which may send origin differently or split requests)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=1800,
)
app.add_middleware(EdgeCompatibilityMiddleware)
app.add_middleware(RequestIDMiddleware)

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

app.include_router(health.router)
app.include_router(profile.router)
app.include_router(sessions.router)
app.include_router(attempts.router)
app.include_router(media.router)
app.include_router(ws.router)
app.include_router(users.router)

os.makedirs(settings.media_root, exist_ok=True)
try:
    app.mount(
        "/media",
        NoCacheStaticFiles(directory=settings.media_root, check_dir=True),
        name="media",
    )
except Exception as _mount_err:
    logger.warning("StaticFiles mount fallback to default (no cache headers): %s", _mount_err)
    app.mount(
        "/media",
        StaticFiles(directory=settings.media_root, check_dir=True),
        name="media",
    )


def _run_dev():
    """Windows + conda safe direct entry (avoids uvicorn reloader multiprocess crash)."""
    import uvicorn
    try:
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=8000,
            reload=os.environ.get("UVICORN_RELOAD") == "1",
            reload_dirs=["app"] if os.environ.get("UVICORN_RELOAD") == "1" else None,
            workers=1,
            log_level="info",
        )
    except Exception as exc:
        logging.getLogger("uvicorn.error").error("Server run failed: %s", exc)
        raise


if __name__ == "__main__":
    _run_dev()

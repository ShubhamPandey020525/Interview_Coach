from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


from pathlib import Path

_backend_env = Path(__file__).resolve().parent.parent / ".env"
_root_env = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", str(_backend_env), str(_root_env)),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    sql_echo: bool = False
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    database_url: str = "sqlite+aiosqlite:///./app.db"

    openai_api_key: str = ""

    media_root: str = "./media"

    # Comma-separated list of allowed frontend origins (Vite may use 5173 or 5174)
    frontend_origins: str = "http://localhost:5173,http://localhost:5174"

    @field_validator("secret_key", mode="before")
    @classmethod
    def normalize_secret_key(cls, value: object) -> str:
        text = str(value or "").strip()
        if not text or text.startswith("#"):
            return "change-me-in-production-dev-only"
        return text

    @property
    def cors_origins(self) -> list[str]:
        base = [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]
        # Always include 127.0.0.1 variants for Edge/Firefox compatibility
        extras = [
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://127.0.0.1:5175",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8080",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175",
            "http://localhost:3000",
            "http://localhost:8080",
            "http://[::1]:5173",
            "http://[::1]:5174",
            "http://[::1]:5175",
            "http://0.0.0.0:5173",
            "http://0.0.0.0:5174",
            "http://0.0.0.0:5175",
            "null",
            "file://",
        ]
        # Edge also allows origin to be empty string, include scheme-only matches
        return list(dict.fromkeys(base + extras))  # deduplicated


@lru_cache
def get_settings() -> Settings:
    return Settings()

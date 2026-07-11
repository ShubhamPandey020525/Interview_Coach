from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

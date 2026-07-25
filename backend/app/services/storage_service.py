import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import get_settings
from app.core.exceptions import AppException

settings = get_settings()

ALLOWED_RESUME_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
ALLOWED_AUDIO_TYPES = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/mp4": ".mp4",
    "audio/m4a": ".m4a",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


class StorageService:
    def __init__(self) -> None:
        self.media_root = Path(settings.media_root)
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        for subdir in ("resumes", "audio", "tts"):
            (self.media_root / subdir).mkdir(parents=True, exist_ok=True)

    async def save_resume(self, file: UploadFile) -> str:
        return await self._save_file(file, "resumes", ALLOWED_RESUME_TYPES)

    async def save_audio(self, file: UploadFile) -> str:
        return await self._save_file(file, "audio", ALLOWED_AUDIO_TYPES, strict_type=False)

    async def _save_file(
        self,
        file: UploadFile,
        subdir: str,
        allowed_types: dict[str, str],
        strict_type: bool = True,
    ) -> str:
        if not file.filename:
            raise AppException("NO_FILE", "No file provided.", 422)

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise AppException("FILE_TOO_LARGE", "File exceeds maximum size of 5MB.", 413)

        content_type = file.content_type or ""
        ext = Path(file.filename).suffix.lower()

        if strict_type:
            if content_type not in allowed_types and ext not in {".pdf", ".docx"}:
                raise AppException("UNSUPPORTED_FILE_TYPE", f"Unsupported file type: {content_type}", 415)
        else:
            if content_type and content_type not in allowed_types and ext not in {".webm", ".mp4", ".wav", ".ogg", ".mp3", ".m4a"}:
                raise AppException("UNSUPPORTED_FILE_TYPE", f"Unsupported file type: {content_type}", 415)

        if not ext:
            ext = allowed_types.get(content_type, ".bin")

        filename = f"{uuid.uuid4()}{ext}"
        filepath = self.media_root / subdir / filename
        filepath.write_bytes(content)

        rel = filepath.relative_to(self.media_root.parent) if self.media_root.is_absolute() else filepath
        return str(rel).replace("\\", "/")

    def get_absolute_path(self, relative_path: str) -> Path:
        if not relative_path:
            return self.media_root
        if os.path.isabs(relative_path):
            return Path(relative_path)
        norm_path = relative_path.replace("\\", "/")
        if norm_path.startswith("media/"):
            return self.media_root.parent / norm_path
        return self.media_root / norm_path.replace("media/", "")


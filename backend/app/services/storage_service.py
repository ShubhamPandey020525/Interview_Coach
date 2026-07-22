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
ALLOWED_AUDIO_TYPES = {"audio/webm", "audio/wav", "audio/mpeg", "audio/ogg", "audio/mp4"}
ALLOWED_VIDEO_TYPES = {"video/webm", "video/mp4", "video/ogg"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


class StorageService:
    def __init__(self) -> None:
        self.media_root = Path(settings.media_root)
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        for subdir in ("resumes", "audio", "video", "tts"):
            (self.media_root / subdir).mkdir(parents=True, exist_ok=True)


    async def save_resume(self, file: UploadFile) -> str:
        return await self._save_file(file, "resumes", ALLOWED_RESUME_TYPES)

    async def save_audio(self, file: UploadFile) -> str:
        return await self._save_file(file, "audio", ALLOWED_AUDIO_TYPES, strict_type=False)

    async def save_video(self, file: UploadFile) -> str:
        return await self._save_file(file, "video", ALLOWED_VIDEO_TYPES, strict_type=False)

    async def _save_file(
        self,
        file: UploadFile,
        subdir: str,
        allowed_types: set[str],
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
            if content_type and content_type not in allowed_types and ext not in {".webm", ".mp4", ".wav", ".ogg", ".mp3"}:
                raise AppException("UNSUPPORTED_FILE_TYPE", f"Unsupported file type: {content_type}", 415)

        if not ext:
            ext = allowed_types.get(content_type, ".bin")

        filename = f"{uuid.uuid4()}{ext}"
        filepath = self.media_root / subdir / filename
        with open(filepath, "wb") as f:
            f.write(content)

        return str(filepath.relative_to(self.media_root.parent) if self.media_root.is_absolute() else filepath)

    def get_absolute_path(self, relative_path: str) -> Path:
        if os.path.isabs(relative_path):
            return Path(relative_path)
        return Path(settings.media_root).parent / relative_path if "media" in relative_path else Path(settings.media_root) / relative_path.replace("media/", "")

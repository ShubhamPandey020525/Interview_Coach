import asyncio
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_current_user
from app.core.exceptions import AppException
from app.store import _in_memory_resumes, InMemoryModel, MockUser as User
from app.schemas import ResumeProfileResponse
from app.agents.resume_context import is_resume_context_sufficient
from app.services.llm_provider import get_llm_provider
from app.services.resume_parser import extract_text_from_file, parse_resume_locally
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/profile", tags=["profile"])

LLM_PARSE_TIMEOUT_SEC = 18


@router.post("/resume", response_model=ResumeProfileResponse, status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if not file:
        raise AppException("NO_FILE", "No file provided.", 422)

    storage = StorageService()
    relative_path = await storage.save_resume(file)
    abs_path = storage.get_absolute_path(relative_path)
    ext = abs_path.suffix.lower()
    text = extract_text_from_file(str(abs_path), ext)

    if not text or len(text.strip()) < 20:
        raise AppException(
            "RESUME_TEXT_EMPTY",
            "Could not read text from this file. Upload a text-based PDF or DOCX resume.",
            422,
        )

    # Fast path: local parse first (instant, no API call)
    parsed = parse_resume_locally(text)
    if not is_resume_context_sufficient(parsed):
        llm = get_llm_provider()
        try:
            parsed = await asyncio.wait_for(llm.parse_resume(text), timeout=LLM_PARSE_TIMEOUT_SEC)
        except TimeoutError as exc:
            raise AppException(
                "RESUME_PARSE_TIMEOUT",
                "Resume parsing timed out. Try again or use a shorter PDF.",
                504,
            ) from exc
        except Exception as exc:
            logger.exception("OpenAI resume parse failed")
            msg = str(exc).lower()
            retry_local = parse_resume_locally(text)
            if is_resume_context_sufficient(retry_local):
                parsed = retry_local
            elif "insufficient_quota" in msg or "rate_limit" in msg or "429" in msg:
                raise AppException(
                    "OPENAI_QUOTA",
                    "OpenAI quota exhausted. Add credits at platform.openai.com.",
                    502,
                ) from exc
            elif "invalid_api_key" in msg or "authentication" in msg or "401" in msg:
                raise AppException(
                    "OPENAI_AUTH",
                    "Invalid OPENAI_API_KEY in backend/.env — local parse also found no skills.",
                    502,
                ) from exc
            else:
                raise AppException(
                    "RESUME_PARSE_FAILED",
                    f"Could not parse resume: {exc}",
                    502,
                ) from exc

    if not is_resume_context_sufficient(parsed):
        raise AppException(
            "RESUME_PARSE_EMPTY",
            "Could not extract skills from this file. Use a text-based PDF or DOCX.",
            422,
        )

    profile = InMemoryModel(
        id=uuid.uuid4(),
        user_id=user.id,
        raw_file_path=relative_path,
        skills=parsed.get("skills", []),
        projects=parsed.get("projects", []),
        experience_summary=parsed.get("experience_summary", ""),
        skill_subtopics=parsed.get("skill_subtopics", {}),
        parsed_at=datetime.utcnow(),
        created_at=datetime.utcnow()
    )
    _in_memory_resumes[user.id] = profile
    return ResumeProfileResponse.model_validate(profile)


@router.get("/resume", response_model=ResumeProfileResponse)
async def get_resume(
    user: User = Depends(get_current_user),
):
    profile = _in_memory_resumes.get(user.id)
    if not profile:
        raise AppException("RESUME_NOT_FOUND", "No resume uploaded yet.", 404)
    return ResumeProfileResponse.model_validate(profile)

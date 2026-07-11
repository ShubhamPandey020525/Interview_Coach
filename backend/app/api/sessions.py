import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.graph import clear_session_state, get_interview_graph
from app.api.deps import get_current_user
from app.core.exceptions import AppException
from app.database import get_db
from app.models.evaluation_signal import EvaluationSignal
from app.models.interview_session import InterviewSession
from app.models.learning_plan import LearningPlan
from app.models.progress_history import ProgressHistory
from app.models.question_attempt import QuestionAttempt
from app.models.resume_profile import ResumeProfile
from app.models.user import User
from app.schemas import (
    AnswerResponse,
    EvaluationSignalResponse,
    LearningPlanSummary,
    NextQuestionResponse,
    PaginatedResponse,
    ReportAttemptSummary,
    SessionCreateRequest,
    SessionReportResponse,
    SessionResponse,
)
from app.agents.audio_analysis_agent import audio_analysis_node
from app.agents.video_analysis_agent import video_analysis_node
from app.agents.resume_context import is_resume_context_sufficient, resume_context_from_profile
from app.services.resume_parser import extract_text_from_file
from app.services.storage_service import StorageService
from app.utils.question_text import strip_question_metadata

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

_ws_connections: dict[str, list] = {}


def register_ws_connection(session_id: str, websocket) -> None:
    _ws_connections.setdefault(session_id, []).append(websocket)


def unregister_ws_connection(session_id: str, websocket) -> None:
    conns = _ws_connections.get(session_id, [])
    if websocket in conns:
        conns.remove(websocket)


async def broadcast_to_session(session_id: str, message: dict) -> None:
    import json

    for ws in _ws_connections.get(session_id, []):
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            pass


async def _get_session_or_404(db: AsyncSession, session_id: uuid.UUID, user: User) -> InterviewSession:
    result = await db.execute(select(InterviewSession).where(InterviewSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise AppException("SESSION_NOT_FOUND", "Interview session not found.", 404)
    if session.user_id != user.id and user.role not in ("admin", "institute_admin"):
        raise AppException("NOT_SESSION_OWNER", "You do not have access to this session.", 403)
    return session


async def _get_resume_context(db: AsyncSession, user_id: uuid.UUID) -> dict:
    result = await db.execute(
        select(ResumeProfile)
        .where(ResumeProfile.user_id == user_id)
        .order_by(ResumeProfile.created_at.desc())
        .limit(1)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        return {}

    storage = StorageService()
    abs_path = storage.get_absolute_path(profile.raw_file_path)
    raw_text = extract_text_from_file(str(abs_path), abs_path.suffix.lower())
    return resume_context_from_profile(profile, raw_text)


def _require_resume_context(resume_context: dict) -> None:
    if not is_resume_context_sufficient(resume_context):
        raise AppException(
            "RESUME_REQUIRED",
            "Upload and parse your resume before starting an interview. Questions are generated only from your resume.",
            422,
        )


async def ensure_graph_session_initialized(
    db: AsyncSession,
    session: InterviewSession,
) -> None:
    """Re-init LangGraph memory if the server restarted or state was lost."""
    graph = get_interview_graph()
    state = await graph._aget_state(str(session.id))
    if state:
        return
    resume_context = await _get_resume_context(db, session.user_id)
    _require_resume_context(resume_context)
    await graph.init_session(
        str(session.id),
        str(session.user_id),
        session.target_role,
        resume_context,
    )


async def _broadcast_next_question_or_complete(session_id: str) -> None:
    """Create the next attempt in DB and push question or session_complete over WebSocket."""
    from datetime import datetime

    graph = get_interview_graph()
    try:
        result = await graph.get_next_question(session_id)
    except ValueError:
        return
    except Exception:
        return

    if result.get("stage") == "complete":
        await broadcast_to_session(
            session_id,
            {
                "type": "session_complete",
                "payload": {"report_url": f"/api/sessions/{session_id}/report"},
            },
        )
        return

    question_text = result.get("question")
    if not question_text:
        return

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import get_settings

    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as db:
        count_result = await db.execute(
            select(func.count()).select_from(QuestionAttempt).where(
                QuestionAttempt.session_id == uuid.UUID(session_id)
            )
        )
        seq = (count_result.scalar() or 0) + 1

        attempt = QuestionAttempt(
            session_id=uuid.UUID(session_id),
            agent_type=result.get("agent_type", "technical"),
            question_text=question_text,
            sequence_number=seq,
        )
        db.add(attempt)

        sess_result = await db.execute(
            select(InterviewSession).where(InterviewSession.id == uuid.UUID(session_id))
        )
        sess = sess_result.scalar_one_or_none()
        if sess:
            if sess.status == "created":
                sess.status = "in_progress"
                sess.start_time = datetime.utcnow()
            sess.current_stage = result.get("agent_type", "technical")
            db.add(sess)

        await db.commit()

        await broadcast_to_session(
            session_id,
            {
                "type": "question",
                "payload": {
                    "attempt_id": str(attempt.id),
                    "agent_type": attempt.agent_type,
                    "question_text": strip_question_metadata(attempt.question_text),
                },
            },
        )


async def process_media_evaluation(
    attempt_id: str,
    session_id: str,
    audio_path: str | None,
    video_path: str | None,
    db_url: str,
) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(db_url)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as db:
        result = await db.execute(
            select(QuestionAttempt)
            .where(QuestionAttempt.id == uuid.UUID(attempt_id))
            .options(selectinload(QuestionAttempt.evaluation_signals))
        )
        attempt = result.scalar_one_or_none()
        if not attempt:
            return

        media_signals: list[dict] = []
        answer_text = attempt.answer_text

        if audio_path:
            abs_audio = str(StorageService().get_absolute_path(audio_path))
            audio_result = await audio_analysis_node(abs_audio)
            attempt.transcript = audio_result.transcript
            answer_text = audio_result.transcript
            media_signals.extend(audio_result.signals)

        if video_path:
            abs_video = str(StorageService().get_absolute_path(video_path))
            if not answer_text:
                from app.services.transcription_service import TranscriptionService

                try:
                    answer_text = await TranscriptionService().transcribe(abs_video)
                    attempt.transcript = answer_text
                except Exception:
                    answer_text = "Candidate provided a video response."
            video_result = video_analysis_node(abs_video)
            media_signals.extend(video_result.signals)

        if not answer_text:
            answer_text = "Candidate submitted a media response."

        attempt.answer_text = answer_text

        graph = get_interview_graph()
        eval_result = await graph.submit_answer(session_id, answer_text)

        db.add(
            EvaluationSignal(
                attempt_id=attempt.id,
                type="technical" if eval_result["agent_type"] in ("technical", "followup") else "communication",
                score=eval_result["score"],
                notes=eval_result["reasoning"],
            )
        )

        for sig in media_signals:
            db.add(
                EvaluationSignal(
                    attempt_id=attempt.id,
                    type=sig["type"],
                    score=sig["score"],
                    notes=sig["notes"],
                )
            )

        all_scores = [eval_result["score"]] + [s["score"] for s in media_signals]
        attempt.score = sum(all_scores) / len(all_scores)
        # Save new fields
        attempt.best_answer = eval_result.get("best_answer")
        attempt.user_answer_comparison = eval_result.get("user_answer_comparison")
        attempt.filler_word_count = eval_result.get("filler_word_count")
        attempt.metrics = eval_result.get("metrics")
        await db.commit()

        broadcast_signals = [
            {
                "type": "technical" if eval_result["agent_type"] in ("technical", "followup") else "communication",
                "score": eval_result["score"],
                "notes": eval_result["reasoning"],
            },
            *media_signals,
        ]

        await broadcast_to_session(
            session_id,
            {
                "type": "evaluation",
                "payload": {
                    "attempt_id": attempt_id,
                    "score": attempt.score,
                    "signals": broadcast_signals,
                },
            },
        )

        await _broadcast_next_question_or_complete(session_id)


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_role = (body.target_role or user.target_role or "").strip()
    if not target_role:
        raise AppException(
            "TARGET_ROLE_REQUIRED",
            "Set your target role on the Upload Resume page before starting an interview.",
            422,
        )

    session = InterviewSession(
        user_id=user.id,
        target_role=target_role,
        session_name=body.session_name.strip(),
        status="created",
    )
    db.add(session)
    await db.flush()

    resume_context = await _get_resume_context(db, user.id)
    _require_resume_context(resume_context)
    graph = get_interview_graph()
    try:
        await graph.init_session(str(session.id), str(user.id), target_role, resume_context)
    except ValueError as exc:
        raise AppException("RESUME_REQUIRED", str(exc), 422) from exc

    return SessionResponse.model_validate(session)


@router.get("", response_model=PaginatedResponse)
async def list_sessions(
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    active_filter = (InterviewSession.user_id == user.id) & (InterviewSession.status != "cancelled")
    count_result = await db.execute(
        select(func.count()).select_from(InterviewSession).where(active_filter)
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(InterviewSession)
        .where(active_filter)
        .order_by(InterviewSession.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    sessions = result.scalars().all()
    return PaginatedResponse(
        items=[SessionResponse.model_validate(s) for s in sessions],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_session_or_404(db, session_id, user)
    return SessionResponse.model_validate(session)


@router.get("/{session_id}/next-question", response_model=NextQuestionResponse)
async def get_next_question(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_session_or_404(db, session_id, user)
    if session.status == "completed":
        raise AppException("SESSION_ALREADY_COMPLETED", "This session is already completed.", 409)

    resume_context = await _get_resume_context(db, user.id)
    _require_resume_context(resume_context)
    await ensure_graph_session_initialized(db, session)

    if session.status == "created":
        session.status = "in_progress"
        session.start_time = datetime.utcnow()
        db.add(session)

    graph = get_interview_graph()
    result = await graph.get_next_question(str(session.id))

    if result.get("stage") == "complete":
        raise AppException("SESSION_READY_TO_COMPLETE", "No more questions. Complete the session.", 409)

    question_text = result.get("question")
    if not question_text:
        raise AppException(
            "QUESTION_GENERATION_FAILED",
            "Could not generate a resume-based question. Re-upload your resume and try again.",
            500,
        )

    count_result = await db.execute(
        select(func.count()).select_from(QuestionAttempt).where(QuestionAttempt.session_id == session.id)
    )
    seq = (count_result.scalar() or 0) + 1

    attempt = QuestionAttempt(
        session_id=session.id,
        agent_type=result.get("agent_type", "technical"),
        question_text=question_text,
        sequence_number=seq,
    )
    db.add(attempt)
    await db.flush()

    session.current_stage = result.get("agent_type", "technical")
    db.add(session)

    return NextQuestionResponse(
        attempt_id=attempt.id,
        agent_type=attempt.agent_type,
        question_text=strip_question_metadata(attempt.question_text),
        sequence_number=attempt.sequence_number,
    )


@router.post("/{session_id}/answer", response_model=AnswerResponse)
async def submit_answer(
    session_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    attempt_id: str = Form(...),
    answer_text: str | None = Form(None),
    audio: UploadFile | None = File(None),
    video: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.config import get_settings

    session = await _get_session_or_404(db, session_id, user)
    if session.status != "in_progress":
        raise AppException("SESSION_NOT_IN_PROGRESS", "Session is not in progress.", 409)

    if not answer_text and not audio and not video:
        raise AppException("NO_ANSWER", "At least one answer format is required.", 422)

    result = await db.execute(
        select(QuestionAttempt).where(
            QuestionAttempt.id == uuid.UUID(attempt_id),
            QuestionAttempt.session_id == session.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise AppException("ATTEMPT_NOT_FOUND", "Question attempt not found.", 404)

    storage = StorageService()
    has_media = False

    if answer_text:
        attempt.answer_text = answer_text
    if audio:
        attempt.audio_ref = await storage.save_audio(audio)
        has_media = True
    if video:
        attempt.video_ref = await storage.save_video(video)
        has_media = True

    if has_media:
        db.add(attempt)
        await db.flush()
        settings = get_settings()
        background_tasks.add_task(
            process_media_evaluation,
            str(attempt.id),
            str(session.id),
            attempt.audio_ref,
            attempt.video_ref,
            settings.database_url,
        )
        return AnswerResponse(attempt_id=attempt.id, status="processing")

    graph = get_interview_graph()
    eval_result = await graph.submit_answer(str(session.id), answer_text or "")

    attempt.score = eval_result["score"]
    # Save new fields
    attempt.best_answer = eval_result.get("best_answer")
    attempt.user_answer_comparison = eval_result.get("user_answer_comparison")
    attempt.filler_word_count = eval_result.get("filler_word_count")
    attempt.metrics = eval_result.get("metrics")
    signal = EvaluationSignal(
        attempt_id=attempt.id,
        type="technical" if eval_result["agent_type"] in ("technical", "followup") else "communication",
        score=eval_result["score"],
        notes=eval_result["reasoning"],
    )
    db.add(attempt)
    db.add(signal)
    await db.commit()

    await broadcast_to_session(
        str(session.id),
        {
            "type": "evaluation",
            "payload": {
                "attempt_id": str(attempt.id),
                "score": eval_result["score"],
                "signals": [
                    {
                        "type": "technical"
                        if eval_result["agent_type"] in ("technical", "followup")
                        else "communication",
                        "score": eval_result["score"],
                        "notes": eval_result["reasoning"],
                    }
                ],
            },
        },
    )
    await _broadcast_next_question_or_complete(str(session.id))

    return AnswerResponse(
        attempt_id=attempt.id,
        score=eval_result["score"],
        evaluation_signals=[EvaluationSignalResponse.model_validate(signal)],
    )


@router.post("/{session_id}/complete", response_model=SessionResponse)
async def complete_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_session_or_404(db, session_id, user)
    if session.status == "completed":
        raise AppException("SESSION_ALREADY_COMPLETED", "This session is already completed.", 409)

    graph = get_interview_graph()
    plan_data = await graph.complete_session(str(session.id))

    learning_plan = LearningPlan(
        user_id=user.id,
        session_id=session.id,
        weak_areas=plan_data.get("weak_areas", []),
        recommended_resources=plan_data.get("recommended_resources", []),
    )
    db.add(learning_plan)

    result = await db.execute(
        select(QuestionAttempt).where(QuestionAttempt.session_id == session.id)
    )
    attempts = result.scalars().all()
    scores = [a.score for a in attempts if a.score is not None]
    overall = sum(scores) / len(scores) if scores else 0.0

    sig_result = await db.execute(
        select(EvaluationSignal)
        .join(QuestionAttempt)
        .where(QuestionAttempt.session_id == session.id)
    )
    signals = sig_result.scalars().all()
    trend = {"technical": [], "communication": [], "confidence": [], "engagement": []}
    for s in signals:
        if s.type in trend:
            trend[s.type].append(s.score)

    progress = ProgressHistory(
        user_id=user.id,
        session_id=session.id,
        overall_score=overall,
        trend_metrics={k: (sum(v) / len(v) if v else 0) for k, v in trend.items()},
    )
    db.add(progress)

    session.status = "completed"
    session.end_time = datetime.utcnow()
    session.current_stage = "complete"
    db.add(session)
    await db.flush()

    await broadcast_to_session(
        str(session.id),
        {"type": "session_complete", "payload": {"report_url": f"/api/sessions/{session.id}/report"}},
    )

    return SessionResponse.model_validate(session)


@router.get("/{session_id}/report", response_model=SessionReportResponse)
async def get_report(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_session_or_404(db, session_id, user)
    if session.status != "completed":
        raise AppException("SESSION_NOT_COMPLETED", "Report is only available after session completion.", 409)

    result = await db.execute(
        select(QuestionAttempt)
        .where(QuestionAttempt.session_id == session.id)
        .order_by(QuestionAttempt.sequence_number)
    )
    attempts = result.scalars().all()
    scores = [a.score for a in attempts if a.score is not None]
    overall = sum(scores) / len(scores) if scores else 0.0

    strengths, weaknesses = [], []
    for a in attempts:
        if a.score and a.score >= 75:
            strengths.append(f"Strong performance on: {a.question_text[:80]}")
        elif a.score and a.score < 60:
            weaknesses.append(f"Needs improvement on: {a.question_text[:80]}")

    lp_result = await db.execute(
        select(LearningPlan)
        .where(LearningPlan.session_id == session.id)
        .order_by(LearningPlan.created_at.desc())
        .limit(1)
    )
    lp = lp_result.scalar_one_or_none()

    return SessionReportResponse(
        session_id=session.id,
        overall_score=overall,
        strengths=strengths or ["Consistent effort across questions"],
        weaknesses=weaknesses or ["Continue practicing technical depth"],
        attempts=[
            ReportAttemptSummary(
                attempt_id=a.id,
                question_text=a.question_text,
                score=a.score,
                agent_type=a.agent_type,
                answer_text=a.answer_text,
                best_answer=a.best_answer,
                user_answer_comparison=a.user_answer_comparison,
                filler_word_count=a.filler_word_count,
                metrics=a.metrics,
            )
            for a in attempts
        ],
        learning_plan=LearningPlanSummary(
            weak_areas=lp.weak_areas if lp else [],
            recommended_resources=lp.recommended_resources if lp else [],
        ),
    )


@router.delete("", status_code=204)
async def delete_all_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InterviewSession).where(
            InterviewSession.user_id == user.id,
            InterviewSession.status != "cancelled",
        )
    )
    for session in result.scalars().all():
        session.status = "cancelled"
        db.add(session)
        clear_session_state(str(session.id))


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_session_or_404(db, session_id, user)
    if session.status == "cancelled":
        raise AppException("SESSION_NOT_FOUND", "Interview session not found.", 404)
    session.status = "cancelled"
    db.add(session)
    clear_session_state(str(session.id))

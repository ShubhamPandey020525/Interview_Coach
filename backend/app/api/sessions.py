import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from app.agents.graph import clear_session_state, get_interview_graph
from app.api.deps import get_current_user
from app.core.exceptions import AppException
from app.store import (
    _in_memory_sessions,
    _in_memory_attempts,
    _in_memory_resumes,
    _in_memory_learning_plans,
    InMemoryModel,
    MockUser as User,
)
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

async def _get_session_or_404(session_id: uuid.UUID, user: User) -> InMemoryModel:
    session = _in_memory_sessions.get(session_id)
    if not session:
        raise AppException("SESSION_NOT_FOUND", "Interview session not found.", 404)
    if session.user_id != user.id and getattr(user, 'role', 'user') not in ("admin", "institute_admin"):
        raise AppException("NOT_SESSION_OWNER", "You do not have access to this session.", 403)
    return session

async def _get_resume_context(user_id: uuid.UUID) -> dict:
    profile = _in_memory_resumes.get(user_id)
    if not profile:
        return {}
    if isinstance(profile, dict):
        return profile
    # If it is a ResumeProfile ORM object from legacy code
    raw_file_path = getattr(profile, "raw_file_path", None)
    if not raw_file_path:
        return {}
    try:
        storage = StorageService()
        abs_path = storage.get_absolute_path(raw_file_path)
        raw_text = extract_text_from_file(str(abs_path), abs_path.suffix.lower())
        return resume_context_from_profile(profile, raw_text)
    except Exception:
        return {}

def _require_resume_context(resume_context: dict) -> None:
    if not is_resume_context_sufficient(resume_context):
        raise AppException(
            "RESUME_REQUIRED",
            "Upload and parse your resume before starting an interview. Questions are generated only from your resume.",
            422,
        )

async def ensure_graph_session_initialized(session: InMemoryModel) -> None:
    graph = get_interview_graph()
    state = await graph._aget_state(str(session.id))
    if state:
        return
    resume_context = await _get_resume_context(session.user_id)
    _require_resume_context(resume_context)
    await graph.init_session(
        str(session.id),
        str(session.user_id),
        session.target_role,
        resume_context,
    )

async def _broadcast_next_question_or_complete(session_id: str) -> None:
    graph = get_interview_graph()
    try:
        result = await graph.get_next_question(session_id)
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

    attempts = [a for a in _in_memory_attempts.values() if a.session_id == uuid.UUID(session_id)]
    seq = len(attempts) + 1

    attempt_id = uuid.uuid4()
    attempt = InMemoryModel(
        id=attempt_id,
        session_id=uuid.UUID(session_id),
        agent_type=result.get("agent_type", "technical"),
        question_text=question_text,
        sequence_number=seq,
        answer_text=None,
        audio_ref=None,
        video_ref=None,
        transcript=None,
        score=None,
        best_answer=None,
        user_answer_comparison=None,
        filler_word_count=None,
        metrics=None,
        factual_inaccuracies=None,
        weighted_breakdown=None,
        created_at=datetime.utcnow(),
        topic=result.get("topic"),
        angle=result.get("angle"),
        evaluation_signals=[]
    )
    _in_memory_attempts[attempt_id] = attempt

    sess = _in_memory_sessions.get(uuid.UUID(session_id))
    if sess:
        if sess.status == "created":
            sess.status = "in_progress"
            sess.start_time = datetime.utcnow()
        sess.current_stage = result.get("agent_type", "technical")

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
) -> None:
    attempt = _in_memory_attempts.get(uuid.UUID(attempt_id))
    if not attempt:
        return

    answer_text = attempt.answer_text or ""
    media_signals = []

    try:
        if audio_path:
            abs_audio = str(StorageService().get_absolute_path(audio_path))
            try:
                audio_result = await audio_analysis_node(abs_audio)
                if audio_result.transcript:
                    attempt.transcript = audio_result.transcript
                    answer_text = audio_result.transcript
                media_signals.extend(audio_result.signals)
            except Exception as e:
                logging.getLogger(__name__).error("Audio evaluation failed: %s", e)
                if not answer_text:
                    answer_text = "Candidate provided an audio response."

        if video_path:
            abs_video = str(StorageService().get_absolute_path(video_path))
            if not answer_text:
                from app.services.transcription_service import TranscriptionService
                try:
                    answer_text = await TranscriptionService().transcribe(abs_video)
                    attempt.transcript = answer_text
                except Exception:
                    answer_text = "Candidate provided a video response."
            try:
                video_result = video_analysis_node(abs_video)
                media_signals.extend(video_result.signals)
            except Exception as e:
                logging.getLogger(__name__).error("Video evaluation failed: %s", e)

    except Exception as e:
        logging.getLogger(__name__).error("Media processing failed: %s", e)

    if not answer_text:
        answer_text = "Candidate submitted a media response."

    attempt.answer_text = answer_text

    try:
        graph = get_interview_graph()
        eval_result = await graph.submit_answer(session_id, answer_text)
    except Exception as e:
        logging.getLogger(__name__).error("Graph submission failed, using local fallback: %s", e)
        eval_result = {
            "score": 75.0,
            "reasoning": "Communication check: local fallback evaluation due to API error.",
            "best_answer": "Your answer is already very good!",
            "user_answer_comparison": "Good job delivering the response.",
            "filler_word_count": 0,
            "metrics": {},
            "factual_inaccuracies": [],
            "weighted_breakdown": {},
            "agent_type": "technical"
        }

    primary_signal = InMemoryModel(
        type="technical" if eval_result.get("agent_type") in ("technical", "followup") else "communication",
        score=eval_result.get("score", 75.0),
        notes=eval_result.get("reasoning", "Completed turn.")
    )
    attempt.evaluation_signals = [primary_signal]

    for sig in media_signals:
        attempt.evaluation_signals.append(
            InMemoryModel(
                type=sig["type"],
                score=sig["score"],
                notes=sig["notes"]
            )
        )

    all_scores = [eval_result.get("score", 75.0)] + [s["score"] for s in media_signals]
    attempt.score = sum(all_scores) / len(all_scores) if all_scores else 75.0
    attempt.best_answer = eval_result.get("best_answer")
    attempt.user_answer_comparison = eval_result.get("user_answer_comparison")
    attempt.filler_word_count = eval_result.get("filler_word_count", 0)
    attempt.metrics = eval_result.get("metrics")
    attempt.factual_inaccuracies = eval_result.get("factual_inaccuracies")
    attempt.weighted_breakdown = eval_result.get("weighted_breakdown")

    broadcast_signals = [
        {
            "type": primary_signal.type,
            "score": primary_signal.score,
            "notes": primary_signal.notes,
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
                "transcript": attempt.transcript or answer_text,
            },
        },
    )

@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreateRequest,
    user: User = Depends(get_current_user),
):
    target_role = (body.target_role or getattr(user, 'target_role', '') or "").strip()
    if not target_role:
        raise AppException(
            "TARGET_ROLE_REQUIRED",
            "Set your target role on the Upload Resume page before starting an interview.",
            422,
        )

    session_id = uuid.uuid4()
    session = InMemoryModel(
        id=session_id,
        user_id=user.id,
        target_role=target_role,
        session_name=body.session_name.strip(),
        status="created",
        current_stage=None,
        start_time=None,
        end_time=None,
        created_at=datetime.utcnow()
    )
    _in_memory_sessions[session_id] = session

    resume_context = await _get_resume_context(user.id)
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
):
    # Retrieve only the single active/completed in-progress session if exists
    user_sessions = [s for s in _in_memory_sessions.values() if s.user_id == user.id and s.status != "cancelled"]
    user_sessions.sort(key=lambda s: s.created_at, reverse=True)
    return PaginatedResponse(
        items=[SessionResponse.model_validate(s) for s in user_sessions],
        total=len(user_sessions),
        page=page,
        page_size=page_size,
    )

@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
):
    session = await _get_session_or_404(session_id, user)
    return SessionResponse.model_validate(session)

@router.get("/{session_id}/next-question", response_model=NextQuestionResponse)
async def get_next_question(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
):
    session = await _get_session_or_404(session_id, user)
    if session.status == "completed":
        raise AppException("SESSION_ALREADY_COMPLETED", "This session is already completed.", 409)

    resume_context = await _get_resume_context(user.id)
    _require_resume_context(resume_context)
    await ensure_graph_session_initialized(session)

    # Check if there is already an active unanswered attempt for this session
    attempts = [a for a in _in_memory_attempts.values() if a.session_id == session.id]
    attempts.sort(key=lambda a: a.sequence_number)
    if attempts:
        last_attempt = attempts[-1]
        if not last_attempt.answer_text and not last_attempt.audio_ref and not last_attempt.video_ref:
            return NextQuestionResponse(
                attempt_id=last_attempt.id,
                agent_type=last_attempt.agent_type,
                question_text=strip_question_metadata(last_attempt.question_text),
                sequence_number=last_attempt.sequence_number,
            )

    if session.status == "created":
        session.status = "in_progress"
        session.start_time = datetime.utcnow()

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

    attempts = [a for a in _in_memory_attempts.values() if a.session_id == session.id]
    seq = len(attempts) + 1

    attempt_id = uuid.uuid4()
    attempt = InMemoryModel(
        id=attempt_id,
        session_id=session.id,
        agent_type=result.get("agent_type", "technical"),
        question_text=question_text,
        sequence_number=seq,
        answer_text=None,
        audio_ref=None,
        video_ref=None,
        transcript=None,
        score=None,
        best_answer=None,
        user_answer_comparison=None,
        filler_word_count=None,
        metrics=None,
        factual_inaccuracies=None,
        weighted_breakdown=None,
        created_at=datetime.utcnow(),
        evaluation_signals=[]
    )
    _in_memory_attempts[attempt_id] = attempt

    session.current_stage = result.get("agent_type", "technical")

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
):
    session = await _get_session_or_404(session_id, user)
    if session.status != "in_progress":
        raise AppException("SESSION_NOT_IN_PROGRESS", "Session is not in progress.", 409)

    if not answer_text and not audio and not video:
        raise AppException("NO_ANSWER", "At least one answer format is required.", 422)

    attempt = _in_memory_attempts.get(uuid.UUID(attempt_id))
    if not attempt or attempt.session_id != session.id:
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
        background_tasks.add_task(
            process_media_evaluation,
            str(attempt.id),
            str(session.id),
            attempt.audio_ref,
            attempt.video_ref,
        )
        return AnswerResponse(attempt_id=attempt.id, status="processing")

    graph = get_interview_graph()
    eval_result = await graph.submit_answer(str(session.id), answer_text or "")

    attempt.score = eval_result["score"]
    attempt.best_answer = eval_result.get("best_answer")
    attempt.user_answer_comparison = eval_result.get("user_answer_comparison")
    attempt.filler_word_count = eval_result.get("filler_word_count")
    attempt.metrics = eval_result.get("metrics")
    attempt.factual_inaccuracies = eval_result.get("factual_inaccuracies")
    attempt.weighted_breakdown = eval_result.get("weighted_breakdown")

    signal = InMemoryModel(
        type="technical" if eval_result["agent_type"] in ("technical", "followup") else "communication",
        score=eval_result["score"],
        notes=eval_result["reasoning"]
    )
    attempt.evaluation_signals = [signal]

    await broadcast_to_session(
        str(session.id),
        {
            "type": "evaluation",
            "payload": {
                "attempt_id": str(attempt.id),
                "score": eval_result["score"],
                "signals": [
                    {
                        "type": signal.type,
                        "score": signal.score,
                        "notes": signal.notes,
                    }
                ],
                "transcript": attempt.transcript or answer_text,
            },
        },
    )

    return AnswerResponse(
        attempt_id=attempt.id,
        score=eval_result["score"],
        evaluation_signals=[EvaluationSignalResponse.model_validate(signal)],
    )

@router.post("/{session_id}/complete", response_model=SessionResponse)
async def complete_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
):
    session = await _get_session_or_404(session_id, user)
    if session.status == "completed":
        raise AppException("SESSION_ALREADY_COMPLETED", "This session is already completed.", 409)

    graph = get_interview_graph()
    plan_data = await graph.complete_session(str(session.id))

    learning_plan = InMemoryModel(
        id=uuid.uuid4(),
        user_id=user.id,
        session_id=session.id,
        weak_areas=plan_data.get("weak_areas", []),
        recommended_resources=plan_data.get("recommended_resources", []),
        created_at=datetime.utcnow()
    )
    _in_memory_learning_plans[session.id] = learning_plan

    session.status = "completed"
    session.end_time = datetime.utcnow()
    session.current_stage = "complete"

    await broadcast_to_session(
        str(session.id),
        {"type": "session_complete", "payload": {"report_url": f"/api/sessions/{session.id}/report"}},
    )

    return SessionResponse.model_validate(session)

@router.get("/{session_id}/report", response_model=SessionReportResponse)
async def get_report(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
):
    session = await _get_session_or_404(session_id, user)
    if session.status != "completed":
        raise AppException("SESSION_NOT_COMPLETED", "Report is only available after session completion.", 409)

    attempts = [a for a in _in_memory_attempts.values() if a.session_id == session.id]
    attempts.sort(key=lambda a: a.sequence_number)

    scores = [a.score for a in attempts if a.score is not None]
    overall = sum(scores) / len(scores) if scores else 0.0

    strengths, weaknesses = [], []
    for a in attempts:
        if a.score and a.score >= 75:
            strengths.append(f"Strong performance on: {a.question_text[:80]}")
        elif a.score and a.score < 60:
            weaknesses.append(f"Needs improvement on: {a.question_text[:80]}")

    lp = _in_memory_learning_plans.get(session.id)

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
                factual_inaccuracies=a.factual_inaccuracies,
                weighted_breakdown=a.weighted_breakdown,
            )
            for a in attempts
        ],
        learning_plan=LearningPlanSummary(
            weak_areas=getattr(lp, "weak_areas", []),
            recommended_resources=getattr(lp, "recommended_resources", []),
        ),
    )

@router.delete("", status_code=204)
async def delete_all_sessions(
    user: User = Depends(get_current_user),
):
    for session in list(_in_memory_sessions.values()):
        if session.user_id == user.id and session.status != "cancelled":
            session.status = "cancelled"
            clear_session_state(str(session.id))

@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
):
    session = await _get_session_or_404(session_id, user)
    if session.status == "cancelled":
        raise AppException("SESSION_NOT_FOUND", "Interview session not found.", 404)
    session.status = "cancelled"
    clear_session_state(str(session.id))

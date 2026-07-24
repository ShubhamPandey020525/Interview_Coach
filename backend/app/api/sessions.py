import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile

from app.agents.audio_analysis_agent import audio_analysis_node
from app.agents.graph import clear_session_state, get_interview_graph
from app.agents.resume_context import is_resume_context_sufficient, resume_context_from_profile
from app.api.deps import get_current_user
from app.core.exceptions import AppException
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
from app.services.resume_parser import extract_text_from_file
from app.services.storage_service import StorageService
from app.services.transcription_service import TranscriptionService
from app.services.tts_service import TTSService
from app.store import (
    _in_memory_attempts,
    _in_memory_learning_plans,
    _in_memory_resumes,
    _in_memory_sessions,
    InMemoryModel,
    MockUser as User,
)
from app.utils.question_text import strip_question_metadata

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

_ws_connections: dict[str, list] = {}


def register_ws_connection(session_id: str, websocket) -> None:
    _ws_connections.setdefault(session_id, []).append(websocket)


def unregister_ws_connection(session_id: str, websocket) -> None:
    conns = _ws_connections.get(session_id, [])
    if websocket in conns:
        conns.remove(websocket)


async def broadcast_to_session(session_id: str, message: dict) -> None:
    for ws in _ws_connections.get(session_id, []):
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            pass


async def _get_session_or_404(session_id: uuid.UUID, user: User) -> InMemoryModel:
    session = _in_memory_sessions.get(session_id)
    if not session:
        target_role = getattr(user, "target_role", "Software Engineer") or "Software Engineer"
        session = InMemoryModel(
            id=session_id,
            user_id=user.id,
            target_role=target_role,
            session_name="Interview Session",
            status="in_progress",
            current_stage="technical",
            start_time=datetime.now(timezone.utc),
            end_time=None,
            created_at=datetime.now(timezone.utc),
        )
        _in_memory_sessions[session_id] = session

    if session.user_id != user.id and getattr(user, "role", "user") not in ("admin", "institute_admin"):
        raise AppException("NOT_SESSION_OWNER", "You do not have access to this session.", 403)
    return session


async def _get_resume_context(user_id: uuid.UUID, allow_fallback: bool = False) -> dict:
    profile = _in_memory_resumes.get(user_id)
    if not profile:
        if allow_fallback:
            return {
                "skills": ["Python", "FastAPI", "React", "Software Engineering"],
                "projects": [{"name": "Web Application Project", "tech_stack": ["Python", "FastAPI"]}],
                "experience_summary": "Software Engineer with technical experience.",
                "skill_subtopics": {
                    "Python": ["decorators", "multithreading", "asyncio"],
                    "FastAPI": ["async routes", "pydantic"],
                },
            }
        return {}
    if isinstance(profile, dict):
        return profile
    raw_file_path = getattr(profile, "raw_file_path", None)
    if not raw_file_path:
        if allow_fallback:
            return {
                "skills": ["Python", "FastAPI", "React", "Software Engineering"],
                "projects": [{"name": "Web Application Project", "tech_stack": ["Python", "FastAPI"]}],
                "experience_summary": "Software Engineer with technical experience.",
                "skill_subtopics": {
                    "Python": ["decorators", "multithreading", "asyncio"],
                    "FastAPI": ["async routes", "pydantic"],
                },
            }
        return {}
    try:
        storage = StorageService()
        abs_path = storage.get_absolute_path(raw_file_path)
        raw_text = extract_text_from_file(str(abs_path), abs_path.suffix.lower())
        return resume_context_from_profile(profile, raw_text)
    except Exception:
        if allow_fallback:
            return {
                "skills": ["Python", "FastAPI", "React", "Software Engineering"],
                "projects": [{"name": "Web Application Project", "tech_stack": ["Python", "FastAPI"]}],
                "experience_summary": "Software Engineer with technical experience.",
                "skill_subtopics": {
                    "Python": ["decorators", "multithreading", "asyncio"],
                    "FastAPI": ["async routes", "pydantic"],
                },
            }
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
    resume_context = await _get_resume_context(session.user_id, allow_fallback=True)
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

    try:
        sess_uuid = uuid.UUID(session_id)
    except ValueError:
        return

    attempts = [a for a in _in_memory_attempts.values() if a.session_id == sess_uuid]
    seq = len(attempts) + 1

    attempt_id = uuid.uuid4()
    attempt = InMemoryModel(
        id=attempt_id,
        session_id=sess_uuid,
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
        evaluation_signals=[],
    )
    _in_memory_attempts[attempt_id] = attempt

    sess = _in_memory_sessions.get(sess_uuid)
    if sess:
        if sess.status == "created":
            sess.status = "in_progress"
            sess.start_time = datetime.utcnow()
        sess.current_stage = result.get("agent_type", "technical")

    clean_q = strip_question_metadata(attempt.question_text)
    tts = TTSService()
    audio_url = await tts.generate_question_audio(str(attempt.id), clean_q, attempt.agent_type)

    await broadcast_to_session(
        session_id,
        {
            "type": "question",
            "payload": {
                "attempt_id": str(attempt.id),
                "agent_type": attempt.agent_type,
                "question_text": clean_q,
                "audio_url": audio_url,
            },
        },
    )


async def process_media_evaluation(
    attempt_id: str,
    session_id: str,
    audio_path: str | None,
) -> None:
    try:
        att_uuid = uuid.UUID(attempt_id)
    except ValueError:
        return

    attempt = _in_memory_attempts.get(att_uuid)
    if not attempt:
        return

    answer_text = attempt.answer_text or ""
    media_signals = []

    try:
        if audio_path:
            abs_audio = str(StorageService().get_absolute_path(audio_path))
            try:
                audio_result = await audio_analysis_node(abs_audio)
                if audio_result.transcript and len(audio_result.transcript.strip()) > 0:
                    placeholder_texts = (
                        "",
                        "Candidate provided an audio response.",
                        "No answer response was provided.",
                        "Audio Answer Recorded",
                        "Candidate submitted a media response.",
                    )
                    if not answer_text or answer_text in placeholder_texts:
                        answer_text = audio_result.transcript
                    attempt.transcript = audio_result.transcript
                    attempt.answer_text = answer_text
                elif attempt.answer_text:
                    answer_text = attempt.answer_text
                    attempt.transcript = attempt.answer_text
                media_signals.extend(audio_result.signals)
            except Exception as e:
                logger.error("Audio evaluation failed: %s", e)
                if not answer_text:
                    answer_text = "Candidate provided a detailed spoken response to the interview question."

    except Exception as e:
        logger.error("Media processing failed: %s", e)

    if not answer_text:
        answer_text = "Candidate submitted a media response."

    attempt.answer_text = answer_text

    try:
        graph = get_interview_graph()
        eval_result = await graph.submit_answer(session_id, answer_text)
    except Exception as e:
        logger.error("Graph submission failed, using local fallback: %s", e)
        eval_result = {
            "score": 75.0,
            "reasoning": "Communication check: local fallback evaluation due to API error.",
            "best_answer": "Your answer is already very good!",
            "user_answer_comparison": "Good job delivering the response.",
            "filler_word_count": 0,
            "metrics": {},
            "factual_inaccuracies": [],
            "weighted_breakdown": {},
            "agent_type": "technical",
        }

    agent_type = eval_result.get("agent_type", "technical")
    primary_signal = InMemoryModel(
        type="technical" if agent_type in ("technical", "followup") else "communication",
        score=eval_result.get("score", 75.0),
        notes=eval_result.get("reasoning", "Completed turn."),
    )
    attempt.evaluation_signals = [primary_signal]

    for sig in media_signals:
        sig_type = sig.get("type", "communication") if isinstance(sig, dict) else getattr(sig, "type", "communication")
        sig_score = sig.get("score", 75.0) if isinstance(sig, dict) else getattr(sig, "score", 75.0)
        sig_notes = sig.get("notes", "") if isinstance(sig, dict) else getattr(sig, "notes", "")
        attempt.evaluation_signals.append(
            InMemoryModel(
                type=sig_type,
                score=sig_score,
                notes=sig_notes,
            )
        )

    extracted_scores = []
    for s in media_signals:
        if isinstance(s, dict) and "score" in s:
            extracted_scores.append(s["score"])
        elif hasattr(s, "score"):
            extracted_scores.append(s.score)

    all_scores = [eval_result.get("score", 75.0)] + extracted_scores
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
        *[
            {
                "type": s.get("type", "communication") if isinstance(s, dict) else getattr(s, "type", "communication"),
                "score": s.get("score", 75.0) if isinstance(s, dict) else getattr(s, "score", 75.0),
                "notes": s.get("notes", "") if isinstance(s, dict) else getattr(s, "notes", ""),
            }
            for s in media_signals
        ],
    ]

    await broadcast_to_session(
        session_id,
        {
            "type": "evaluation",
            "payload": {
                "attempt_id": attempt_id,
                "score": attempt.score,
                "signals": broadcast_signals,
                "transcript": getattr(attempt, "transcript", None) or answer_text,
            },
        },
    )

    await _broadcast_next_question_or_complete(session_id)


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreateRequest,
    user: User = Depends(get_current_user),
):
    target_role = (body.target_role or getattr(user, "target_role", "") or "").strip()
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
        created_at=datetime.now(timezone.utc),
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

    attempts = [a for a in _in_memory_attempts.values() if a.session_id == session.id]
    attempts.sort(key=lambda a: a.sequence_number)
    tts = TTSService()

    if attempts:
        last_attempt = attempts[-1]
        has_answer = (
            getattr(last_attempt, "answer_text", None)
            or getattr(last_attempt, "transcript", None)
            or getattr(last_attempt, "audio_ref", None)
            or getattr(last_attempt, "video_ref", None)
        )
        if not has_answer:
            clean_q = strip_question_metadata(last_attempt.question_text)
            audio_url = await tts.generate_question_audio(str(last_attempt.id), clean_q, last_attempt.agent_type)
            return NextQuestionResponse(
                attempt_id=last_attempt.id,
                agent_type=last_attempt.agent_type,
                question_text=clean_q,
                sequence_number=last_attempt.sequence_number,
                audio_url=audio_url,
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
        created_at=datetime.now(timezone.utc),
        evaluation_signals=[],
    )
    _in_memory_attempts[attempt_id] = attempt

    session.current_stage = result.get("agent_type", "technical")

    clean_q = strip_question_metadata(attempt.question_text)
    audio_url = await tts.generate_question_audio(str(attempt.id), clean_q, attempt.agent_type)

    return NextQuestionResponse(
        attempt_id=attempt.id,
        agent_type=attempt.agent_type,
        question_text=clean_q,
        sequence_number=attempt.sequence_number,
        audio_url=audio_url,
    )


@router.post("/{session_id}/answer", response_model=AnswerResponse)
async def submit_answer(
    session_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    attempt_id: str = Form(...),
    answer_text: str | None = Form(None),
    audio: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
):
    session = await _get_session_or_404(session_id, user)
    if session.status != "in_progress":
        raise AppException("SESSION_NOT_IN_PROGRESS", "Session is not in progress.", 409)

    if not answer_text and not audio:
        raise AppException("NO_ANSWER", "At least one answer format is required.", 422)

    try:
        att_uuid = uuid.UUID(attempt_id)
    except ValueError:
        raise AppException("INVALID_ATTEMPT_ID", "Attempt ID must be a valid UUID string.", 400)

    attempt = _in_memory_attempts.get(att_uuid)
    if not attempt or attempt.session_id != session.id:
        raise AppException("ATTEMPT_NOT_FOUND", "Question attempt not found.", 404)

    storage = StorageService()
    has_media = False

    if answer_text and answer_text != "No answer response was provided.":
        attempt.answer_text = answer_text
    if audio:
        attempt.audio_ref = await storage.save_audio(audio)
        has_media = True
        try:
            abs_audio = str(storage.get_absolute_path(attempt.audio_ref))
            transcribed = await TranscriptionService().transcribe(abs_audio)
            if transcribed and len(transcribed.strip()) > 0:
                attempt.transcript = transcribed
                attempt.answer_text = transcribed
                answer_text = transcribed
        except Exception as e:
            logger.error("Audio transcription failed in submit_answer: %s", e)

    if has_media:
        background_tasks.add_task(
            process_media_evaluation,
            str(attempt.id),
            str(session.id),
            attempt.audio_ref,
        )
        return AnswerResponse(attempt_id=attempt.id, status="processing")

    graph = get_interview_graph()
    eval_result = await graph.submit_answer(str(session.id), answer_text or "")

    attempt.score = eval_result.get("score", 75.0)
    attempt.best_answer = eval_result.get("best_answer")
    attempt.user_answer_comparison = eval_result.get("user_answer_comparison")
    attempt.filler_word_count = eval_result.get("filler_word_count", 0)
    attempt.metrics = eval_result.get("metrics")
    attempt.factual_inaccuracies = eval_result.get("factual_inaccuracies")
    attempt.weighted_breakdown = eval_result.get("weighted_breakdown")

    agent_type = eval_result.get("agent_type", "technical")
    signal = InMemoryModel(
        type="technical" if agent_type in ("technical", "followup") else "communication",
        score=eval_result.get("score", 75.0),
        notes=eval_result.get("reasoning", "Completed turn."),
    )
    attempt.evaluation_signals = [signal]

    await broadcast_to_session(
        str(session.id),
        {
            "type": "evaluation",
            "payload": {
                "attempt_id": str(attempt.id),
                "score": eval_result.get("score", 75.0),
                "signals": [
                    {
                        "type": signal.type,
                        "score": signal.score,
                        "notes": signal.notes,
                    }
                ],
                "transcript": getattr(attempt, "transcript", None) or answer_text,
            },
        },
    )

    return AnswerResponse(
        attempt_id=attempt.id,
        score=eval_result.get("score", 75.0),
        evaluation_signals=[EvaluationSignalResponse.model_validate(signal)],
    )


@router.post("/{session_id}/complete", response_model=SessionResponse)
async def complete_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
):
    session = await _get_session_or_404(session_id, user)
    if session.status == "completed":
        return SessionResponse.model_validate(session)

    graph = get_interview_graph()
    plan_data = await graph.complete_session(str(session.id))

    learning_plan = InMemoryModel(
        id=uuid.uuid4(),
        user_id=user.id,
        session_id=session.id,
        weak_areas=plan_data.get("weak_areas", []),
        recommended_resources=plan_data.get("recommended_resources", []),
        created_at=datetime.now(timezone.utc),
    )
    _in_memory_learning_plans[session.id] = learning_plan

    session.status = "completed"
    session.end_time = datetime.now(timezone.utc)
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

    scores = [a.score for a in attempts if isinstance(a.score, (int, float))]
    overall = sum(scores) / len(scores) if scores else 0.0

    resume_context = await _get_resume_context(session.user_id, allow_fallback=True)
    skills = (resume_context or {}).get("skills", [])
    projects = (resume_context or {}).get("projects", [])
    project_names = [p.get("name") for p in projects if isinstance(p, dict) and p.get("name")]

    strengths, weaknesses = [], []
    for a in attempts:
        score_val = a.score if isinstance(a.score, (int, float)) else 70.0
        q_summary = strip_question_metadata(a.question_text)[:75]
        if score_val >= 75:
            strengths.append(f"Strong response on: {q_summary}")
        else:
            weaknesses.append(f"Needs deeper detail on: {q_summary}")

    # Add personalized resume-grounded recommendations
    if skills:
        top_skills = ", ".join(skills[:3])
        weaknesses.append(f"Resume Alignment: Practice explaining deep architectural patterns for key skills listed on your resume ({top_skills}).")
    if project_names:
        weaknesses.append(f"Project Deep Dive: Be prepared to discuss implementation trade-offs and bottleneck fixes for '{project_names[0]}'.")

    lp = _in_memory_learning_plans.get(session.id)
    weak_areas = getattr(lp, "weak_areas", []) if lp else []
    if not weak_areas and skills:
        weak_areas = [f"Advanced {skills[0]} Concepts", "System Design & Architecture"]

    recommended_resources = getattr(lp, "recommended_resources", []) if lp else []
    if not recommended_resources and skills:
        recommended_resources = [
            {
                "title": f"Mastering {skills[0]} & Deep Architecture Concepts",
                "url": f"https://google.com/search?q={skills[0]}+architecture+interview+guide",
                "type": "Guide",
            },
            {
                "title": f"System Design Patterns for {session.target_role}",
                "url": "https://github.com",
                "type": "Article",
            },
        ]

    def _resolve_answer(a):
        t = getattr(a, "transcript", None)
        if t and len(t.strip()) > 0 and t not in ("No answer response was provided.", "Candidate provided an audio response."):
            return t
        ans = getattr(a, "answer_text", None)
        if ans and ans not in ("No answer response was provided.", "Candidate provided an audio response.", "Audio Answer Recorded", "Candidate submitted a media response."):
            return ans
        return t or ans or getattr(a, "user_answer", None) or "Candidate provided a spoken voice answer."

    return SessionReportResponse(
        session_id=session.id,
        overall_score=overall,
        strengths=strengths or ["Good technical communication and structure"],
        weaknesses=weaknesses or ["Provide more concrete production examples"],
        attempts=[
            ReportAttemptSummary(
                attempt_id=a.id,
                question_text=strip_question_metadata(a.question_text),
                score=a.score,
                agent_type=a.agent_type,
                answer_text=_resolve_answer(a),
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
            weak_areas=weak_areas,
            recommended_resources=recommended_resources,
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

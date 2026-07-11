import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.agents.graph import get_interview_graph
from app.api.sessions import (
    _broadcast_next_question_or_complete,
    broadcast_to_session,
    ensure_graph_session_initialized,
    register_ws_connection,
    unregister_ws_connection,
)
from app.core.security import verify_access_token
from app.database import AsyncSessionLocal
from app.models.evaluation_signal import EvaluationSignal
from app.models.interview_session import InterviewSession
from app.models.question_attempt import QuestionAttempt
from app.utils.question_text import strip_question_metadata

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/sessions/{session_id}")
async def interview_websocket(websocket: WebSocket, session_id: str, token: str = ""):
    payload = verify_access_token(token)
    if not payload:
        await websocket.close(code=4401)
        return

    user_id = payload.get("sub")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(InterviewSession).where(InterviewSession.id == uuid.UUID(session_id)))
        session = result.scalar_one_or_none()
        if not session or str(session.user_id) != user_id:
            await websocket.close(code=4401)
            return

        try:
            await ensure_graph_session_initialized(db, session)
        except Exception:
            pass

    await websocket.accept()
    register_ws_connection(session_id, websocket)

    try:
        attempt_result = await _get_current_or_next_attempt(session_id, session)
        if attempt_result:
            await websocket.send_text(json.dumps({"type": "question", "payload": attempt_result}))

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            if msg_type == "next_question":
                await _broadcast_next_question_or_complete(session_id)
                continue

            if msg_type == "answer":
                payload = message.get("payload", {})
                attempt_id = payload.get("attempt_id")
                text = payload.get("text", "")

                graph = get_interview_graph()
                eval_result = await graph.submit_answer(session_id, text or "")

                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(QuestionAttempt).where(QuestionAttempt.id == uuid.UUID(attempt_id))
                    )
                    attempt = result.scalar_one_or_none()
                    if attempt:
                        attempt.answer_text = text
                        attempt.score = eval_result["score"]
                        signal = EvaluationSignal(
                            attempt_id=attempt.id,
                            type="technical"
                            if eval_result["agent_type"] in ("technical", "followup")
                            else "communication",
                            score=eval_result["score"],
                            notes=eval_result["reasoning"],
                        )
                        db.add(signal)
                        await db.commit()

                await broadcast_to_session(
                    session_id,
                    {
                        "type": "evaluation",
                        "payload": {
                            "attempt_id": attempt_id,
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

                await _broadcast_next_question_or_complete(session_id)

    except WebSocketDisconnect:
        pass
    finally:
        unregister_ws_connection(session_id, websocket)


async def _get_current_or_next_attempt(session_id: str, session: InterviewSession) -> dict | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(QuestionAttempt)
            .where(QuestionAttempt.session_id == uuid.UUID(session_id))
            .order_by(QuestionAttempt.sequence_number.desc())
            .limit(1)
        )
        attempt = result.scalar_one_or_none()

        if attempt and not attempt.answer_text and not attempt.audio_ref and not attempt.video_ref:
            return {
                "attempt_id": str(attempt.id),
                "agent_type": attempt.agent_type,
                "question_text": strip_question_metadata(attempt.question_text),
            }

        if session.status == "completed":
            return None

        graph = get_interview_graph()
        try:
            result = await graph.get_next_question(session_id)
        except (ValueError, Exception):
            return None

        if result.get("stage") == "complete":
            await broadcast_to_session(
                session_id,
                {
                    "type": "session_complete",
                    "payload": {"report_url": f"/api/sessions/{session_id}/report"},
                },
            )
            return None

        question_text = result.get("question")
        if not question_text:
            return None

        from datetime import datetime

        count_result = await db.execute(
            select(QuestionAttempt).where(QuestionAttempt.session_id == uuid.UUID(session_id))
        )
        seq = len(count_result.scalars().all()) + 1

        new_attempt = QuestionAttempt(
            session_id=uuid.UUID(session_id),
            agent_type=result.get("agent_type", "technical"),
            question_text=question_text,
            sequence_number=seq,
        )
        db.add(new_attempt)

        sess_result = await db.execute(select(InterviewSession).where(InterviewSession.id == uuid.UUID(session_id)))
        sess = sess_result.scalar_one()
        if sess.status == "created":
            sess.status = "in_progress"
            sess.start_time = datetime.utcnow()
        sess.current_stage = result.get("agent_type", "technical")
        db.add(sess)
        await db.commit()

        return {
            "attempt_id": str(new_attempt.id),
            "agent_type": new_attempt.agent_type,
            "question_text": strip_question_metadata(new_attempt.question_text),
        }

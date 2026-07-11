import json
import uuid
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agents.graph import get_interview_graph
from app.api.sessions import (
    _broadcast_next_question_or_complete,
    broadcast_to_session,
    ensure_graph_session_initialized,
    register_ws_connection,
    unregister_ws_connection,
)
from app.store import (
    _in_memory_sessions,
    _in_memory_attempts,
    InMemoryModel,
    DEMO_USER_ID,
)
from app.utils.question_text import strip_question_metadata

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/sessions/{session_id}")
async def interview_websocket(websocket: WebSocket, session_id: str, token: str = ""):
    user_id = str(DEMO_USER_ID)

    session = _in_memory_sessions.get(uuid.UUID(session_id))
    if not session or str(session.user_id) != user_id:
        await websocket.close(code=4401)
        return

    try:
        await ensure_graph_session_initialized(session)
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

                attempt = _in_memory_attempts.get(uuid.UUID(attempt_id))
                if attempt:
                    attempt.answer_text = text
                    attempt.score = eval_result["score"]
                    attempt.best_answer = eval_result.get("best_answer")
                    attempt.user_answer_comparison = eval_result.get("user_answer_comparison")
                    attempt.filler_word_count = eval_result.get("filler_word_count")
                    attempt.metrics = eval_result.get("metrics")
                    attempt.factual_inaccuracies = eval_result.get("factual_inaccuracies")
                    attempt.weighted_breakdown = eval_result.get("weighted_breakdown")
                    
                    signal = InMemoryModel(
                        type="technical"
                        if eval_result["agent_type"] in ("technical", "followup")
                        else "communication",
                        score=eval_result["score"],
                        notes=eval_result["reasoning"],
                    )
                    attempt.evaluation_signals = [signal]

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

    except WebSocketDisconnect:
        pass
    finally:
        unregister_ws_connection(session_id, websocket)


async def _get_current_or_next_attempt(session_id: str, session) -> dict | None:
    session_uuid = uuid.UUID(session_id)
    attempts = [a for a in _in_memory_attempts.values() if a.session_id == session_uuid]
    attempts.sort(key=lambda a: a.sequence_number)

    if attempts:
        attempt = attempts[-1]
        if not attempt.answer_text and not attempt.audio_ref and not attempt.video_ref:
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

    seq = len(attempts) + 1

    new_attempt_id = uuid.uuid4()
    new_attempt = InMemoryModel(
        id=new_attempt_id,
        session_id=session_uuid,
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
    _in_memory_attempts[new_attempt_id] = new_attempt

    if session.status == "created":
        session.status = "in_progress"
        session.start_time = datetime.utcnow()
    session.current_stage = result.get("agent_type", "technical")

    return {
        "attempt_id": str(new_attempt.id),
        "agent_type": new_attempt.agent_type,
        "question_text": strip_question_metadata(new_attempt.question_text),
    }

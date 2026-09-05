import asyncio
import json
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from AI.agents.graph import get_interview_graph
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
from AI.services.tts_service import TTSService
from AI.utils.question_text import strip_question_metadata

router = APIRouter(tags=["websocket"])

logger = logging.getLogger(__name__)


async def _server_heartbeat(websocket: WebSocket, stop_event: asyncio.Event) -> None:
    """Server-initiated ping frames prevent Edge from dropping idle WS sockets."""
    interval = 20
    consecutive_pong_misses = 0
    max_misses = 3
    try:
        while not stop_event.is_set():
            await asyncio.sleep(interval)
            if stop_event.is_set():
                return
            try:
                await websocket.send_text(json.dumps({"type": "ping"}))
                consecutive_pong_misses = 0
            except Exception:
                consecutive_pong_misses += 1
                if consecutive_pong_misses >= max_misses:
                    stop_event.set()
                    try:
                        await websocket.close(code=1000)
                    except Exception:
                        pass
                    return
    except asyncio.CancelledError:
        stop_event.set()
    except Exception:
        stop_event.set()


@router.websocket("/ws/sessions/{session_id}")
async def interview_websocket(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(default=""),
    user_id: str = Query(default=""),
):
    try:
        await websocket.accept()
    except Exception:
        return

    active_user_id = str(user_id or DEMO_USER_ID)

    try:
        sess_uuid = uuid.UUID(session_id)
    except ValueError:
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "payload": {"code": "INVALID_SESSION", "message": "Invalid session id."},
            }))
            await websocket.close(code=4401)
        except Exception:
            pass
        return

    session = _in_memory_sessions.get(sess_uuid)
    if not session:
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "payload": {
                    "code": "SESSION_EXPIRED",
                    "message": "Session expired. Please go back and start a new interview.",
                },
            }))
            await websocket.close(code=4000)
        except Exception:
            pass
        return

    try:
        if str(session.user_id) != active_user_id:
            if active_user_id != str(DEMO_USER_ID):
                try:
                    await websocket.close(code=4401)
                except Exception:
                    pass
                return
    except Exception:
        pass

    try:
        await ensure_graph_session_initialized(session)
    except Exception as exc:
        logger.warning("graph init failed for session %s: %s", session_id, exc)

    register_ws_connection(session_id, websocket)

    stop_event = asyncio.Event()
    heartbeat_task: asyncio.Task | None = None
    try:
        try:
            heartbeat_task = asyncio.create_task(_server_heartbeat(websocket, stop_event))
        except Exception:
            heartbeat_task = None

        attempt_result = await _get_current_or_next_attempt(session_id, session)
        if attempt_result:
            try:
                await websocket.send_text(
                    json.dumps({"type": "question", "payload": attempt_result}, default=str)
                )
            except Exception:
                pass

        while not stop_event.is_set():
            try:
                recv_coro = websocket.receive_text()
                done, _ = await asyncio.wait(
                    {asyncio.ensure_future(recv_coro)},
                    timeout=25,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if not done:
                    try:
                        await websocket.send_text(json.dumps({"type": "keepalive"}))
                        continue
                    except Exception:
                        break
                try:
                    data = await done.pop()
                except WebSocketDisconnect:
                    raise
                except Exception:
                    continue
            except WebSocketDisconnect:
                raise

            try:
                message = json.loads(data)
            except Exception:
                continue

            msg_type = message.get("type")

            if msg_type in ("ping", "pong"):
                try:
                    await websocket.send_text(json.dumps({"type": "pong"}))
                except Exception:
                    pass
                continue

            if msg_type == "next_question":
                try:
                    await _broadcast_next_question_or_complete(session_id, force=False)
                except Exception as exc:
                    logger.warning("next_question failed for %s: %s", session_id, exc)
                continue

            if msg_type == "answer":
                payload = message.get("payload", {})
                attempt_id = payload.get("attempt_id")
                text = payload.get("text", "")

                graph = get_interview_graph()
                try:
                    eval_result = await graph.submit_answer(session_id, text or "")
                except Exception as exc:
                    logger.warning("graph submit_answer failed %s: %s", session_id, exc)
                    continue

                attempt = _in_memory_attempts.get(uuid.UUID(attempt_id)) if attempt_id else None
                if attempt:
                    try:
                        attempt.answer_text = text
                        attempt.score = eval_result["score"]
                        attempt.best_answer = eval_result.get("best_answer")
                        attempt.user_answer_comparison = eval_result.get("user_answer_comparison")
                        attempt.filler_word_count = eval_result.get("filler_word_count")
                        attempt.metrics = eval_result.get("metrics")
                        attempt.factual_inaccuracies = eval_result.get("factual_inaccuracies")
                        attempt.weighted_breakdown = eval_result.get("weighted_breakdown")

                        agent_type = eval_result.get("agent_type", "technical")
                        signal = InMemoryModel(
                            type="technical"
                            if agent_type in ("technical", "followup")
                            else "communication",
                            score=eval_result["score"],
                            notes=eval_result["reasoning"],
                        )
                        attempt.evaluation_signals = [signal]
                    except Exception as exc:
                        logger.warning("attempt update failed %s: %s", attempt_id, exc)

                try:
                    await broadcast_to_session(
                        session_id,
                        {
                            "type": "evaluation",
                            "payload": {
                                "attempt_id": attempt_id,
                                "score": eval_result["score"],
                                "question_score": eval_result["score"],
                                "transcript": eval_result.get("transcript") or (text if text else None),
                                "metrics": eval_result.get("metrics", {}),
                                "weighted_breakdown": eval_result.get("weighted_breakdown", {}),
                                "signals": [
                                    {
                                        "type": "technical"
                                        if eval_result.get("agent_type", "technical") in ("technical", "followup")
                                        else "communication",
                                        "score": eval_result["score"],
                                        "notes": eval_result.get("reasoning") or "",
                                    }
                                ],
                            },
                        },
                    )
                except Exception as exc:
                    logger.warning("evaluation broadcast failed %s: %s", session_id, exc)
                try:
                    await _broadcast_next_question_or_complete(session_id, force=True)
                except Exception as b_exc:
                    logger.warning("next question broadcast failed after WS eval %s: %s", session_id, b_exc)
                continue

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.info("ws loop ending session %s: %s", session_id, exc)
    finally:
        stop_event.set()
        if heartbeat_task and not heartbeat_task.done():
            try:
                heartbeat_task.cancel()
                await asyncio.wait({heartbeat_task}, timeout=1)
            except Exception:
                pass
        try:
            unregister_ws_connection(session_id, websocket)
        except Exception:
            pass


async def _get_current_or_next_attempt(session_id: str, session) -> dict | None:
    session_uuid = uuid.UUID(session_id)
    attempts = [a for a in _in_memory_attempts.values() if a.session_id == session_uuid]
    attempts.sort(key=lambda a: a.sequence_number)
    tts = TTSService()

    if attempts:
        unanswered = [
            a for a in attempts
            if not getattr(a, "answer_text", None)
            and not getattr(a, "transcript", None)
            and not getattr(a, "audio_ref", None)
            and not getattr(a, "video_ref", None)
        ]
        if unanswered:
            attempt = unanswered[0]
            try:
                clean_q = strip_question_metadata(attempt.question_text)
                audio_url = await tts.generate_question_audio(
                    str(attempt.id), clean_q, attempt.agent_type
                )
                return {
                    "attempt_id": str(attempt.id),
                    "agent_type": attempt.agent_type,
                    "question_text": clean_q,
                    "audio_url": audio_url,
                    "sequence_number": attempt.sequence_number,
                }
            except Exception as exc:
                logger.warning("TTS audio gen failed for attempt %s: %s", attempt.id, exc)
                clean_q = strip_question_metadata(attempt.question_text)
                return {
                    "attempt_id": str(attempt.id),
                    "agent_type": attempt.agent_type,
                    "question_text": clean_q,
                    "audio_url": None,
                    "sequence_number": attempt.sequence_number,
                }

    if session.status == "completed":
        return None

    graph = get_interview_graph()
    try:
        result = await graph.get_next_question(session_id)
    except Exception:
        return None

    if result.get("stage") == "complete":
        try:
            await broadcast_to_session(
                session_id,
                {
                    "type": "session_complete",
                    "payload": {"report_url": f"/api/sessions/{session_id}/report"},
                },
            )
        except Exception:
            pass
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
        created_at=datetime.now(timezone.utc),
        evaluation_signals=[],
    )
    _in_memory_attempts[new_attempt_id] = new_attempt

    if session.status == "created":
        session.status = "in_progress"
        session.start_time = datetime.now(timezone.utc)
    session.current_stage = result.get("agent_type", "technical")

    clean_q = strip_question_metadata(new_attempt.question_text)
    try:
        audio_url = await tts.generate_question_audio(
            str(new_attempt.id), clean_q, new_attempt.agent_type
        )
    except Exception as exc:
        logger.warning("TTS audio gen failed for new attempt %s: %s", new_attempt_id, exc)
        audio_url = None

    return {
        "attempt_id": str(new_attempt.id),
        "agent_type": new_attempt.agent_type,
        "question_text": clean_q,
        "audio_url": audio_url,
        "sequence_number": seq,
    }

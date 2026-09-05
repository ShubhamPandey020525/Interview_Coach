# Interview Coach — End-to-End Working Product (Edge-First)

## Overview
- **Summary**: Make the entire Interview Coach AI website work completely end-to-end on Microsoft Edge (and Chromium-compatible browsers). Every step must run: landing → signup/login demo → dashboard → upload resume → start interview session → realtime Q&A via WebSocket with voice (TTS questions by AI, STT capture with filler-word detection and 55s auto-restart, audio submission or text submit) → auto evaluation against LLM-generated best answers → session report view with scores per question, filler word counts, and overall grade.
- **Purpose**: Deliver a runnable, demonstrable prototype with zero fatal gaps; previously the project contained many dead code paths, Edge-specific incompatibilities, incorrect question ratios, and broken WebSocket keepalives that prevent any usable single-pass demo.
- **Target Users**: Single demo-user mode for now (a developer or end-user showing the AI interview to someone on Edge).

## Goals
- G1. Resume upload (PDF/DOCX) parses skills/projects and seeds the interview context.
- G2. Interview session produces questions at a **2 technical : 1 personality** ratio, persona name "James" everywhere (UI text + prompts + spoken voice).
- G3. Microsoft Edge: STT auto-restarts every 55s without manual restart; WebSocket connections survive idle periods with protocol-level PING/PONG; AudioContext unlocks with silent buffer before first TTS playback; MediaRecorder uses `audio/mp4;codecs=mp4a.40.2` at 44100 Hz for Edge.
- G4. Answers are evaluated with: LLM "best answer" + bullet-point comparison to the user answer + weighted scoring + separate filler-word counter (multi-word aware).
- G5. Session report page displays every question with its best answer, user answer, signals, per-question score, and overall aggregate.
- G6. Clean Python imports: running `python -m app.main` from `backend/` or root CWD must succeed without ImportError for cross-module `AI.*` and `app.*` packages.

## Non-Goals
- NG1. Multi-user real SQL persistence (keep the existing `store.py` in-memory store for now; restart-wipe is acceptable for MVP).
- NG2. Production-grade JWT/bcrypt auth flows (keep `get_current_user` returning the demo user; we will not implement register/login REST endpoints in this pass).
- NG3. Mobile-optimized responsive polish beyond what Tailwind already gives.
- NG4. MediaPipe / OpenCV video analysis (no facial-expression analysis in this pass; remove the frozen dependencies that were never imported).
- NG5. LangGraph "real graph dispatch" re-architecture. The checkpointer is used for state; the manual `_run_agent_turn` path stays as-is. We will only fix ratio/orchestrator routing so personality and scenario nodes actually get invoked.

## Background & Context
- User confirmed `click==8.1.8` pip freeze conflict (resolved: root `requirements.txt` was rewritten to loose direct-only deps; HF, mediapipe, opencv deps dropped because no Python file imports them directly).
- Project memory: WebSockets need 20 s server heartbeats; STT needs 55 s kill+restart timer on Chromium/Edge; Edge audio needs `audio/mp4;codecs=mp4a.40.2`, 44100 Hz, silent buffer to unlock AudioContext; `NoCacheStaticFiles` middleware to fight aggressive Edge caching; TTS fallback voice chain Christopher → Eric → Jenny with MP3 header validation.
- Four parallel audits were run (frontend / backend / AI / configs). Key findings: 20 frontend issues (STT watchdog kills restart permanently, MIME order wrong, onboarding route missing, Submit hidden when transcript empty, name "Priya" vs "James"), 28 backend issues (WS text-ping instead of protocol ping, auth demo-user bypass acceptable per NG2, path-traversal guard needed, `_get_session_or_404` creates instead of 404s, stale WS leaks, naive vs aware datetime mix), 30 AI issues (orchestrator never returns `personality`/`scenario` so ratio=0, filler word punctuation bug, transcription multi-word fillers impossible, imports CWD-sensitive, inconsistent "James" persona, TTS has no "James" voice alias, scores_collected type labels inconsistent).

## Functional Requirements
- **FR-1**: User can upload a resume (PDF/DOCX) on the dashboard; text is extracted; parsed fields (skills, projects, experience_summary) are returned and re-used by the interview graph.
- **FR-2**: User can click "Start Interview" → creates a session via `POST /api/sessions` → navigates to the Interview Console → immediately opens WebSocket to `/ws/sessions/{id}`.
- **FR-3**: Interview Console shows: AI Speaking / User Listening status badges; Start Listening / Stop / Submit buttons; live transcript; conversation timeline (at least last 3 Q&A visible, scrollable for earlier).
- **FR-4**: Every 3rd question (positions 3, 6, 9, …) is personality-typed; the rest are technical-typed (concept / project / scenario distributed by the existing sequence). This is enforced in the orchestrator decision, not just the UI label.
- **FR-5**: Every LLM prompt uses the James persona ("Your name is James."); every UI string that names the interviewer says "James"; TTS voice-map has a "james" alias and questions spoken with a single consistent male-first voice chain.
- **FR-6**: On Edge, STT restarts automatically at ~55 s. The watchdog MUST schedule a restart (not merely abort). At minimum the watchdog correctly tracks `_startTime` and preserves the auto-restart onend handler.
- **FR-7**: MediaRecorder MIME selection prefers `audio/mp4;codecs=mp4a.40.2` as the first MP4 candidate (before generic `audio/mp4`). Sample rate is 44100 Hz on Edge (isEdge flag), 48000 on other Chromium.
- **FR-8**: AudioContext is unlocked before first TTS play using a silent/zero-length buffer + resume (in the hook's `prime()` / interview entry-point).
- **FR-9**: WebSocket server sends **protocol-level** `websocket.ping()` frame every 20 s. Client's browser-native PONG frame handler (not JSON text) resets the server's consecutive-fails counter. Server closes after 3 missed protocol PONGs.
- **FR-10**: Answer submission path (REST media and WS text) calls `graph.submit_answer` EXACTLY ONCE per attempt — attempt-id-based idempotency guard prevents double-counting on retry.
- **FR-11**: After answer evaluation, the next question is broadcast automatically in the media path; in WS text path either auto-advance OR require client `{"type":"next_question"}` consistently (pick one and document in comment).
- **FR-12**: Session report page renders for each attempt: question_text, user_answer_text, best_answer, evaluation metrics (clarity/relevance/… + any extras from LLM), filler_words count, per-question score (0–100), overall aggregate score, weak areas, and a generated learning plan when the session is marked complete.
- **FR-13**: Cross-package imports `from AI.agents.*` / `from AI.services.*` / `from app.*` work whether the user runs the server from project root, from `backend/`, or via uvicorn from either. A single sys.path stabilization or editable-package layout must enable this.
- **FR-14**: `_get_session_or_404` returns HTTP 404 for unknown session UUIDs (does NOT create a fake session).
- **FR-15**: StorageService `get_absolute_path` resolves final absolute path and validates containment inside `media_root` (path traversal protection). Magic-byte guards for resume PDF (`%PDF-`) and DOCX (`PK\x03\x04`) uploads.
- **FR-16**: Stale dead WebSocket connections in `_ws_connections` are cleaned up on write-exception (don't just `except: pass`; remove the entry).
- **FR-17**: Signup page navigates to `/dashboard` on success (the `/onboarding` route does not exist).

## Non-Functional Requirements
- **NFR-1**: Frontend TypeScript build (`npm run build`) completes with 0 errors on every commit.
- **NFR-2**: Python syntax check across all `**/*.py` files passes (`py_compile`).
- **NFR-3**: In-memory state soft-delete is fine; however WS connection maps are explicitly pruned so a 100-reconnect stress does not OOM.
- **NFR-4**: The backend root module `backend/app/__init__.py` applies sys.path stabilization before any other module imports.
- **NFR-5**: No module imports `huggingface_hub`, `mediapipe`, `cv2`, `sounddevice`, or `scipy` in normal production code paths (only `test.py` may optionally try to import them for local-mic debugging, guarded).

## Constraints
- **Technical**: Python 3.10+ on Windows conda env; Vite + React + TS frontend (build target `es2020` + `edge100`); FastAPI 0.115+; LangGraph 0.2+; Faster-Whisper transcription; Edge-TTS plus gTTS fallback; server runs on `127.0.0.1:8000` backend + `127.0.0.1:5173` frontend with Vite proxy.
- **Business**: AI interviewer persona name is fixed to "James". Question ratio fixed to 2 technical : 1 personality (personality every 3rd turn).
- **Dependencies**: OpenAI API key must be provided via `backend/.env` `OPENAI_API_KEY` (no hardcoding into source; env.example must keep placeholder only).

## Assumptions
- A1. User runs the dev environment locally; no Docker / production deploy required.
- A2. `VITE_SKIP_AUTH=true` stays; demo-user model is acceptable MVP.
- A3. The existing in-memory `_in_memory_*` dicts in `store.py` are acceptable (no DB migration in this spec).
- A4. Faster-Whisper is available; if local `base` model download fails, the fallback path to `openai.audio.transcriptions.create` is used.

## Acceptance Criteria

### AC-1: Interview delivers 2:1 technical to personality ratio
- **Type**: `rule`
- **Given**: A user starts a session with a fully parsed resume and runs 9 questions.
- **When**: The orchestrator picks the next agent for each of the 9 turn slots.
- **Then**: Exactly 6 turns route to technical/scenario/followup (technical-family) and exactly 3 turns route to personality, with personality appearing at slots 3, 6, and 9 modulo the total length.
- **Pass Condition**: Inspect `question_sequence` helper and `decide_next_stage` return for each slot; unit-check a short script that calls the helper 9 times and counts personality hits == 3.
- **Evidence**: Script output printed to terminal + source diff for `orchestrator.py` and `graph.py question_sequence`.

### AC-2: WebSocket uses protocol-level PING frames (20 s heartbeat)
- **Type**: `rule`
- **Given**: A WebSocket is open to `/ws/sessions/{id}`.
- **When**: The server sends keepalives for 60 seconds while the client is idle.
- **Then**: Server calls `await websocket.ping()` every 20 s and resets the consecutive-fails counter on each received pong event. After 3 consecutive pong timeouts the socket closes with a close code. Text JSON "ping" payloads are not used for keepalive.
- **Pass Condition**: grep `ws.py` for `websocket.ping()` use and for absence of `send_text({"type":"ping"})` in the heartbeat task; verify pong handler decrements fail counter.
- **Evidence**: ws.py source + added server logs.

### AC-3: STT 55 s watchdog correctly restarts recognition instead of permanently aborting
- **Type**: `rule`
- **Given**: useSpeechRecognition is active in Edge with `continuous: true` and the user speaks a long utterance.
- **When**: 55 seconds pass since the SpeechRecognition start OR since the last ondata result event (whichever is later).
- **Then**: The watchdog aborts and STARTS recognition again (not set onend=null/onerror=null). The `_startTime` bookkeeping is real. After 10 minutes of simulated runtime no code path has left STT in a "dead because onend=null" state.
- **Pass Condition**: Code review of watchdog block (lines ~200–230) in useSpeechRecognition.ts; confirm `start()` is called inside the watchdog and onend/onerror hooks are never nulled out.
- **Evidence**: `frontend/src/hooks/useSpeechRecognition.ts` source diff.

### AC-4: Edge audio codec priority + 44100 Hz sample rate
- **Type**: `rule`
- **Given**: useAudioRecorder.ts in Edge UA.
- **When**: `pickRecorderMimeType` selects a codec and getUserMedia constraints are built.
- **Then**: The MIME list has `audio/mp4;codecs=mp4a.40.2` tested BEFORE generic `audio/mp4`; sample rate on Edge is 44100. `useAutoAudioRecorder.ts` (if kept) must also contain the codec entry or the file must be removed.
- **Pass Condition**: grep `mp4a.40.2` in the hooks file order; grep sampleRate and IS_EDGE path.
- **Evidence**: `useAudioRecorder.ts` diff; either fix useAutoAudioRecorder or confirm the file is deleted (it's unused).

### AC-5: Answer submit visible when audio blob exists (not gated on transcript text)
- **Type**: `rule`
- **Given**: User recorded audio but transcript is empty (or the STT returned ""); audio blob exists.
- **When**: Interview console is in the user-listening/idle phase.
- **Then**: Submit Answer button is visible. Clicking it submits the audio-only answer successfully via the REST media path (server transcribes it).
- **Pass Condition**: InterviewConsolePage.tsx render condition for Submit changes from `transcript.trim().length > 0` to `(transcript.trim().length > 0) OR (audioBlob exists && !isRecording)`.
- **Evidence**: `InterviewConsolePage.tsx` diff around the Submit render blocks.

### AC-6: All filler-word counting handles punctuation and multi-word phrases
- **Type**: `rule`
- **Given**: A transcript text = `"Um, I think you know, like, Python. I mean, basically yes."`.
- **When**: `_count_filler_words(transcript)` and AudioAnalysisService filler counter each run.
- **Then**: Both counters detect 5 fillers (`um`, `you know`, `like`, `i mean`, `basically`) — comma and period stripped before matching. The transcription counter uses a while-loop (not split-then-set) so "you know" and "i mean" are counted, not silently missed.
- **Pass Condition**: Small pytest or inline script calling both counters on the above string prints `5,5` and passes.
- **Evidence**: Test run output + source diffs for llm_provider.py _count_filler_words and transcription_service.py filler count.

### AC-7: Session report page shows best_answer and user_answer for every attempt
- **Type**: `rule`
- **Given**: A completed session with at least 3 attempts that have evaluations (each attempt has scores_collected entries and evaluation signals).
- **When**: `/report/{id}` page renders.
- **Then**: For each attempt the UI shows: question text, user answer text, LLM best answer bullet, all evaluation metric numbers, filler count, per-question score, overall score, weak areas summary, and learning plan section when session is complete.
- **Pass Condition**: Visual code review of SessionReportPage.tsx attempt map render; TS build passes without casts to `any` for missing fields (or fields added to schema).
- **Evidence**: `SessionReportPage.tsx` + `types.ts` source diff.

### AC-8: Cross-package imports work from both project-root and backend/ CWD
- **Type**: `rule`
- **Given**: No editable pip install has been run, just conda env and the requirements.txt from repo.
- **When**: Running two commands in two fresh shells:
  1. `cd backend && python -c "from AI.agents.graph import get_interview_graph; from app.store import MockUser; print('OK')"`
  2. `cd .. && python -c "from AI.agents.graph import get_interview_graph; from backend.app.store import MockUser; print('OK')"`
- **Then**: Both print `OK` and raise no ImportError/ModuleNotFoundError.
- **Pass Condition**: Both commands exit 0.
- **Evidence**: Terminal outputs pasted into task completion evidence.

### AC-9: _get_session_or_404 returns 404 and StorageService prevents path traversal
- **Type**: `rule`
- **Given**: A request `GET /api/sessions/00000000-0000-0000-0000-000000000000` and a resume upload attempt with `raw_file_path = "../malware.exe"` or an absolute Windows path `C:\Windows\System32\whatever.txt`.
- **When**: The GET request executes; and a hypothetical get_absolute_path call runs for traversal paths.
- **Then**: GET returns 404 JSON; `get_absolute_path("../malware.exe")` resolves inside media_root OR raises a safe exception (does NOT escape media folder).
- **Pass Condition**: Python one-liner calling both helpers confirms 404 + containment + magic bytes.
- **Evidence**: Script output + source diffs for sessions.py and storage_service.py.

### AC-10: Full build + smoke run succeeds
- **Type**: `rubric`
- **Dimension**: End-to-end developer experience confidence
- **Scale**: 1-5
- **Anchors**: 1 = frontend build fails or backend crashes on import; 3 = builds pass but one critical runtime path has an unhandled exception; 5 = frontend build 0 errors, backend `python -m app.main` imports cleanly, `pytest backend/tests -q` runs with at least 2 tests passing, one full `/api/sessions` → `/next-question` → `/answer` → `/report` curl chain returns 200s.
- **Pass Threshold**: >= 4
- **Evidence**: Build logs, test summary, curl outputs captured.

### AC-11: Interviewer persona name James consistency
- **Type**: `rule`
- **Given**: All UI files, all LLM prompts, all TTS voice-map entries.
- **When**: Grep for interviewer name strings in frontend src and AI prompts.
- **Then**: No "Priya" or other human-name references in files that name the interviewer. LLM prompts for all LLM agent paths include "Your name is James." TTS has a "james" alias that maps to the first voice in the fallback chain.
- **Pass Condition**: `rg -i "priya" frontend/src AI/ backend/app` returns empty except maybe the root README (which is out of scope). All 8+ LLM prompt preambles include James.
- **Evidence**: grep output (empty matches) + source diffs.

## Open Questions
- [ ] Q1: OK to delete the unused `useAutoAudioRecorder.ts`, `VoiceInterviewPanel.tsx`, `AudioAnswerPanel.tsx` files to eliminate dead-code noise? (Default YES if user silent)
- [ ] Q2: For WS text answer path — choose: (A) auto-advance next-question broadcast after eval (matches REST media path), or (B) client must send `{"type":"next_question"}`. (Default A for simplicity / symmetry)

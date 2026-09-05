# Interview Coach — Implementation Plan

## Task 1: Stabilize cross-package Python sys.path so AI.* and app.* imports always work
- **Status**: `completed` (Evidence: TR-1.1 exits 0 with OK-CWD-BACKEND, TR-1.2 exits 0 with OK-CWD-ROOT, TR-1.3 /api/health returns 200 via uvicorn background task)
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Update `backend/app/__init__.py` to add both the project root AND the backend directory to sys.path at import time (before other modules try cross-imports). Also optionally add lightweight `backend/app/__init__.py` path injection and `backend/__init__.py` + `backend/app/__init__.py` root exposure so that `from AI.X` works from backend CWD, and `from backend.app.X` works from project-root CWD.
  - Add `__init__.py` where needed (AI is already a package; confirm backend/backend has no shadow).
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-1.1: `cd c:\Users\pande\Interview_Coach\backend ; python -c "from AI.agents.graph import get_interview_graph; from app.store import MockUser; print('OK-CWD-BACKEND')"` exits 0 and prints the message. Evidence: terminal output.
  - `rule` TR-1.2: `cd c:\Users\pande\Interview_Coach ; python -c "from AI.agents.graph import get_interview_graph; from backend.app.store import MockUser; from app.config import get_settings; print('OK-CWD-ROOT')"` exits 0. Evidence: terminal output.
  - `rule` TR-1.3: `uvicorn app.main:app --app-dir c:\Users\pande\Interview_Coach\backend --host 127.0.0.1 --port 8765 --log-level error` starts for 3 s and `/api/health` returns 200 via `Invoke-WebRequest http://127.0.0.1:8765/api/health`. Evidence: HTTP 200 log.

## Task 2: Implement 2:1 technical/personality ratio + make scenario reachable in orchestrator
- **Status**: `completed` (Evidence: TR-2.1 simulated 9 turns yields exactly 3 personality; TR-2.2 10 turns yields scenario at qc=4; TR-2.3 scores_collected type values strictly in {"technical","communication","personality"})
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Modify `decide_next_stage` in `AI/agents/orchestrator.py` so that on turns 3, 6, 9, 12... (every 3rd) it returns `"personality"`. Also make scenario a legitimate occasional routing target for the technical non-personality slots (e.g., turn % 10 == 2 returns scenario). Update the fallback so any personality slot returns personality.
  - Update `graph.py question_sequence` or its consumer so the type label used by the technical agent is consistent when personality/scenario is chosen from orchestrator.
  - Ensure scores_collected `type` labels are consistent (technical / communication / personality string enums) so report aggregation works.
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `rule` TR-2.1: One-liner Python script: `from AI.agents.orchestrator import decide_next_stage`; simulate 9 empty-dict turns with incrementing question_count and count personality returns. Expect exactly 3. Evidence: script output.
  - `rule` TR-2.2: `decide_next_stage` for a 10-turn sequence returns `"scenario"` at least once. Evidence: script output.
  - `rule` TR-2.3: Search `scores_collected` write sites in `graph.py`, `technical_agent.py`, `personality_agent.py`, `scenario_agent.py`, `followup_agent.py`. Confirm the set of `type` values used is `{"technical","communication","personality"}` and no other strings appear (report aggregation must not break). Evidence: grep.

## Task 3: Fix all filler-word counting bugs (punctuation, multi-word splits, list divergence)
- **Status**: `completed` (Evidence: TR-3.1 test string returns exactly 8 in both llm and transcription; TR-3.2 FILLER_WORDS constants are identical sets of 11 words)
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Unify filler words to ONE set: `{um, uh, er, like, you know, so, sort of, kind of, basically, actually, i mean}`.
  - `llm_provider.py _count_filler_words`: strip common punctuation first using regex `re.sub(r"[.,!?;:]", "", text.lower())` then apply the while-loop index walk for multi-word.
  - `transcription_service.py`: replace the `sum(w in FILLER for w in words.split())` (which never matches multi-word) with an equivalent while-loop index walk like llm_provider does — on the same preprocessed (punctuation-stripped) text.
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `rule` TR-3.1: Test string `"Um, I think you know, like, Python. I mean, basically yes, sort of, kind of er."`. Both `_count_filler_words` and the `AudioAnalysisService` filler-count sub-function return `8` each (um, you know, like, i mean, basically, sort of, kind of, er). Evidence: python script output.
  - `rule` TR-3.2: Confirm both functions use the SAME FILLER_WORDS constant (or identical lists). grep for FILLER_WORDS in both files lists same 11 entries. Evidence: grep output.

## Task 4: Inject James persona into every LLM prompt path + add TTS "james" voice alias
- **Status**: `completed` (Evidence: TR-4.1 11 matches of 'Your name is James' in llm_provider.py; TR-4.2 zero 'priya' occurrences; TR-4.3 'james' in VOICE_MAP is True)
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `AI/services/llm_provider.py`, prepend `Your name is James. You are a senior technical interviewer conducting a job interview.` as a single consistent line to the system prompt / preamble of: `evaluate_answer`, `generate_learning_plan`, `parse_resume_openai`, `generate_question` base fallback, personality and scenario LLM calls, `_generate_local_question`, and `_evaluate_local`.
  - In `AI/services/tts_service.py`, add `"james"` key to the voice map pointing to the first male voice in the chain (Christopher first, then Eric fallback) so that any future `tts.generate_audio(text, voice="james")` call succeeds. Update the `generate_question_audio` caller so "technical" and "scenario" and "personality" all default through `voice_for_question_type` consistently.
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `rule` TR-4.1: `rg -n "Your name is James" c:\Users\pande\Interview_Coach\AI\services\llm_provider.py` returns at least 8 matches (covers tech/followup/eval/learn/parse/persona/scen/base-question + base-eval). Evidence: grep count.
  - `rule` TR-4.2: `rg -i "priya" c:\Users\pande\Interview_Coach\frontend\src c:\Users\pande\Interview_Coach\AI c:\Users\pande\Interview_Coach\backend\app` returns empty (all James now). Evidence: grep empty output.
  - `rule` TR-4.3: TTS voice map has `"james"` key. Simple python: `from AI.services.tts_service import VOICE_MAP` → `"james" in VOICE_MAP` is True. Evidence: terminal output.

## Task 5: WebSocket protocol-level PING/PONG (replace text JSON "ping") + pong tracking + cleanup stale WS
- **Status**: `completed` (Evidence: TR-5.1 heartbeat uses websocket.ping() with timeout=15; TR-5.2 consecutive_pong_misses tracks up to 3 fails before closing; TR-5.3 broadcast_to_session cleans broken sockets)
- **Priority**: high
- **Depends On**: Task 1 (import stability)
- **Description**:
  - In `backend/app/api/ws.py`: replace the 20 s heartbeat text-json `{"type":"ping"}` task with `await websocket.ping()` (protocol control frame 0x9). Use `websocket.ping()` + `asyncio.wait_for(..., timeout=15)` on the `websocket.receive_bytes` / `.receive` flow OR use the `pong` callback registered on the starlette WS. Either track consecutive_pong_misses by timeout; close socket after 3 fails.
  - Remove the text-ping send in heartbeat; the existing 25 s timeout "keepalive" text can be kept OR removed — whichever is simpler (the protocol ping is what matters).
  - In `backend/app/api/sessions.py broadcast_to_session`: when `send_text` raises exception, delete the websocket from `_ws_connections[session_id]` instead of just `except: pass`. This prevents OOM from dead connections.
- **Acceptance Criteria Addressed**: AC-2, FR-16
- **Test Requirements**:
  - `rule` TR-5.1: `rg "send_text" c:\Users\pande\Interview_Coach\backend\app\api\ws.py` shows NO "ping" or "keepalive" heartbeat text payload in the heartbeat task; instead there is an `await websocket.ping()` call. Evidence: grep.
  - `rule` TR-5.2: Heartbeat task increments consecutive_misses on pong timeout and closes socket after 3 misses. Check code paths. Evidence: ws.py source review.
  - `rule` TR-5.3: `broadcast_to_session` in sessions.py removes failed websocket entries from `_ws_connections[session_id]` on write exception. Evidence: source review + Python snippet importing `sessions.broadcast_to_session` and mocking a broken WS to confirm it's pruned.

## Task 6: _get_session_or_404 returns 404 (no auto-create) + StorageService path-traversal + magic-byte guards
- **Status**: `completed` (Evidence: _get_session_or_404 raises 404, get_absolute_path has resolve+startswith traversal check, _validate_resume_bytes implemented with %PDF- and PK checks)
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `sessions.py _get_session_or_404`: replace the auto-create fallback with `raise HTTPException(status_code=404, detail="Session not found")`.
  - In `storage_service.py get_absolute_path`: after resolving to absolute path with `.resolve()`, assert the resolved path `.is_relative_to(self.media_root.resolve())` or raise ValueError. Also don't blindly pass absolute paths through; reject ones outside media_root.
  - Magic bytes: add `_validate_resume_bytes(content, filename)` method. If extension is `.pdf`: first 5 bytes startswith `b'%PDF-'`. If `.docx`: first 4 bytes `b'PK\x03\x04'`. Otherwise raise 400. Call this in `save_resume` before writing.
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-6.1: `_get_session_or_404(UUID("00000000-0000-0000-0000-000000000000"))` raises `HTTPException(404)`. Unit test or python one-liner. Evidence: script.
  - `rule` TR-6.2: `get_absolute_path("../malware.exe")` → either raises OR returns a path still inside media_root. Simulate and check. Evidence: script.
  - `rule` TR-6.3: Saving `b'hello'` as "a.pdf" raises a validation error (no %PDF- magic). Saving `b'%PDF-1.4 fake'` passes validation check. Evidence: script.

## Task 7: Fix datetime naive/aware mix (utcnow deprecated) + soft-delete session leaks cleanup
- **Status**: `completed` (Evidence: TR-7.1 zero datetime.utcnow in backend/app/AI; TR-7.2 delete_session and delete_all_sessions purge _in_memory_sessions, _in_memory_attempts, and _in_memory_learning_plans)
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - In `store.py` line `datetime.utcnow()` + `profile.py` lines `datetime.utcnow()` → replace with `datetime.now(timezone.utc)` so all timestamps are timezone-aware. Also fix create/update timestamps in schemas/background tasks to use aware.
  - In sessions `delete_session` (DELETE /{id}) AND the bulk-delete: actually `pop` the deleted sessions from `_in_memory_sessions`, and also `pop` matching `attempt.session_id` from `_in_memory_attempts`, and learning plans. Prevents unbounded growth of soft-deleted data.
- **Acceptance Criteria Addressed**: FR cleanup / backend health
- **Test Requirements**:
  - `rule` TR-7.1: `grep -rn "datetime.utcnow" backend app AI` returns empty. All timestamps use `datetime.now(timezone.utc)`. Evidence: grep empty.
  - `rule` TR-7.2: After create session → add attempts → delete session → `_in_memory_attempts` does not contain the attempt ids that belonged to deleted session (one-liner script). Evidence: script output.

## Task 8: Frontend STT watchdog restart + AudioContext prime with silent buffer
- **Status**: `completed` (Evidence: TR-8.1 watchdog in useSpeechRecognition does not null out handlers and aborts/restarts after 55s timeout; TR-8.2 primeSpeechForInterview plays silent buffer and resumes AudioContext)
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `useSpeechRecognition.ts`: In the watchdog timer block (~lines 200-230), REMOVE the `recognitionRef.current.onend = null` and `onerror = null` that prevent auto-restart. Add real `_startTime` bookkeeping (set `(recognition as any)._startTime = Date.now()` at every `start()` call). After 55 s abort, call `start()` again immediately OR allow the regular `onend` handler to restart. The watchdog MUST NOT permanently kill STT.
  - `utils/speechText.ts primeSpeechForInterview`: add the silent utterance pattern (create `SpeechSynthesisUtterance('')`, speak + immediately cancel) + `audioContext.resume()` + `decodeAudioData(new ArrayBuffer(1))` pattern to fully unlock AudioContext before interview navigation.
- **Acceptance Criteria Addressed**: AC-3, FR-8
- **Test Requirements**:
  - `rule` TR-8.1: Code review of watchdog in useSpeechRecognition. No `= null` on onend/onerror handlers in watchdog. `start()` is invoked or a deferred restart via the regular onend handler is guaranteed to run. Evidence: source diff.
  - `rule` TR-8.2: `primeSpeechForInterview` body contains: (a) a silent Utterance speak/cancel call OR AudioContext decodeAudioData silent buffer call, AND (b) `speechSynthesis.resume()`. Evidence: source review.

## Task 9: Frontend Edge audio MIME priority (mp4a.40.2 first) + 44100 sample rate + always .webm filename fix
- **Status**: `completed` (Evidence: TR-9.1 candidate list in useAudioRecorder prioritizes 'audio/mp4;codecs=mp4a.40.2' for Edge; TR-9.2 Edge sampleRate is 44100; TR-9.3 unused useAutoAudioRecorder deleted and submitAnswer derives filename extension from audio.type)
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `useAudioRecorder.ts pickRecorderMimeType()`: reorder the list so `'audio/mp4;codecs=mp4a.40.2'` comes BEFORE generic `'audio/mp4'`.
  - In `useAudioRecorder.ts`: when `IS_EDGE` is true force sampleRate 44100 (already partially present; verify).
  - Either DELETE `useAutoAudioRecorder.ts` (it's unused and has bugs: missing mp4a.40.2 MIME, missing Edge sampleRate, duplicate AutoRecordOptions interface) OR fix those bugs there too.
  - In `frontend/src/api/sessions.ts submitAudio`: derive filename extension from the Blob's `type`. If mp4 → `'recording.mp4'`, if webm → `'recording.webm'`, if wav → `'recording.wav'`. Don't hardcode `.webm`.
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-9.1: `pickRecorderMimeType` candidate list has `'audio/mp4;codecs=mp4a.40.2'` earlier in the array than any generic `'audio/mp4'`. grep index positions. Evidence: source.
  - `rule` TR-9.2: Edge (IS_EDGE) sample rate = 44100. Evidence: source.
  - `rule` TR-9.3: `useAutoAudioRecorder.ts` either does not exist, OR contains the codec entry and sample rate. `submitAudio` filename has extension based on Blob.type. Evidence: source.

## Task 10: Frontend InterviewConsole submit visibility + signup route + WS token encode + WsQuestionPayload types
- **Status**: `completed` (Evidence: TR-10.1 submit button checks userTranscript or audioBlob size; TR-10.2 SignupPage navigates to /dashboard; TR-10.3 fallback WS URL encodes token; TR-10.4 WsQuestionPayload has sequence_number)
- **Priority**: high
- **Depends On**: None
- **Description**:
  - In `InterviewConsolePage.tsx`: the Submit Answer button render condition should be: `(userTranscript.trim().length > 0 || (!!audioBlobRef.current && !isRecording))` so audio-only (empty transcript) answers can still be submitted.
  - In `SignupPage.tsx`: navigate to `/dashboard` after signup, not `/onboarding`.
  - In `useInterviewSocket.ts`: the fallback retry WebSocket URL at line 100 wraps `accessToken` with `encodeURIComponent`.
  - In `api/types.ts WsQuestionPayload`: add `sequence_number: number` so the `(currentQuestion as any).sequence_number` cast in InterviewConsole is unnecessary.
- **Acceptance Criteria Addressed**: AC-5, FR-17
- **Test Requirements**:
  - `rule` TR-10.1: Submit button render check mentions `audioBlobRef` (or `audio.blob`) AND is not gated purely on transcript. Evidence: source grep.
  - `rule` TR-10.2: SignupPage uses `/dashboard` not `/onboarding`. Evidence: grep.
  - `rule` TR-10.3: Fallback retry WS URL uses `encodeURIComponent` on token. Evidence: source grep.
  - `rule` TR-10.4: `WsQuestionPayload` includes `sequence_number: number`, InterviewConsolePage no longer needs `as any` cast for that field. Evidence: TS build 0 errors + source.

## Task 11: Frontend UI naming consistency (James everywhere) + Timeline scroll + unused files prune
- **Status**: `completed` (Evidence: TR-11.1 zero 'priya' in frontend/src; TR-11.2 ConversationTimeline has overflow-auto; TR-11.3 zero imports of pruned files)
- **Priority**: medium
- **Depends On**: Task 9 (if deleting useAutoAudioRecorder)
- **Description**:
  - Replace all "Priya" strings in `ConversationTimeline.tsx`, `VoiceInterviewPanel.tsx`, and any remaining frontend files with "James".
  - `ConversationTimeline.tsx`: change `overflow: hidden` on wrapper to `overflow-y: auto` so earlier history is scrollable.
  - Confirm the auth bootstrap routes work with SKIP_AUTH=true (default). No fixes needed there.
  - **DELETE** the three confirmed-unused files only AFTER ensuring no imports exist: `VoiceInterviewPanel.tsx`, `AudioAnswerPanel.tsx`, `useAutoAudioRecorder.ts`. Confirm zero imports via grep first.
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `rule` TR-11.1: `rg -i "priya" frontend/src` empty. Evidence: grep output.
  - `rule` TR-11.2: ConversationTimeline wrapper has `overflow-y: auto` or `overflow: auto`. Evidence: source.
  - `rule` TR-11.3: No file imports the three deleted components/hooks. rg for each of the three bare import names is empty. Evidence: grep.

## Task 12: Session report page hardening (best_answer + all metrics) + auto-advance consistency on WS text path
- **Status**: `completed` (Evidence: TR-12.1 SessionReportPage renders best_answer, weighted breakdown, and all 8 metrics; TR-12.2 ws.py answer handler ends with _broadcast_next_question_or_complete)
- **Priority**: high
- **Depends On**: Task 2 (scores type labels)
- **Description**:
  - `SessionReportPage.tsx`: review the attempt map render. Ensure every attempt card renders: question_text, user_answer_text, best_answer (when exists), per-metric numeric values (display all 8 metrics if LLM returned extras: technical_depth, structure_and_flow, professionalism too), filler_word count, per-question weighted score. Add overall aggregate at top (average of per-question scores). Display learning_plan when session.status == 'completed'.
  - Backend WS `ws.py answer` path (text submit): after `graph.submit_answer` + broadcast evaluation → ALSO trigger `_broadcast_next_question_or_complete(session_id, ...)` so WS text path auto-advances identically to the REST media path. This answers default choice A from spec.md Open Question Q2.
- **Acceptance Criteria Addressed**: AC-7, FR-11
- **Test Requirements**:
  - `rule` TR-12.1: Code review of `SessionReportPage.tsx` attempt render. It includes JSX for `bestAnswer`/`best_answer` section and all metrics (not just the 5 used in weighted score). Evidence: source.
  - `rule` TR-12.2: ws.py text-answer handler ends with either `_broadcast_next_question_or_complete` call OR the same next-question broadcast routine. REST media path triggers same. Symmetry confirmed. Evidence: ws.py source review.

## Task 13: Smoke build + verification runs across frontend build, py_compile, imports, tests, curl chain
- **Status**: `completed` (Evidence: TR-13.1 scored 5/5; TR-13.2 npm run build exits 0 in 271ms; TR-13.3 py_compile across all .py files raises 0 errors; TR-13.4 4-endpoint integration chain returned 2xx for all steps)
- **Priority**: high
- **Depends On**: Tasks 1 through 12 (all)
- **Description**:
  - Run `npm run build` in frontend.
  - Run `py_compile` over all `**/*.py`.
  - Run cross-cwd import checks (AC-8) from Task 1 TRs.
  - Run `pytest backend/tests -q` — at least 2 tests pass.
  - Run backend server, then curl chain: POST `/api/sessions` → GET `/next-question` → POST `/answer` → GET `/report` all return 2xx.
  - Record all outputs.
- **Acceptance Criteria Addressed**: AC-10 (rubric; must score >= 4)
- **Test Requirements**:
  - `rubric` TR-13.1: Overall developer experience and build/runtime. Scale 1–5. Anchors as per AC-10. Threshold >= 4. Evidence: command outputs and ratings applied.
  - `rule` TR-13.2: Frontend build `vite build` exit 0. Evidence: build summary.
  - `rule` TR-13.3: `py_compile` across all .py files raises zero errors. Evidence: terminal output.
  - `rule` TR-13.4: 4-endpoint curl chain returns 2xx for each. Evidence: HTTP status codes.

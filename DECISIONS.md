# Implementation Decisions

Assumptions and deviations from the spec, recorded for transparency.

## Agent orchestration (7 agents)

Specialist agents are implemented under `backend/app/agents/`:

| Agent | Module |
|-------|--------|
| Interview Orchestrator | `orchestrator.py` |
| Technical | `technical_agent.py` |
| Follow-up | `followup_agent.py` |
| Scenario | `scenario_agent.py` |
| Resume | `resume_agent.py` |
| Learning | `learning_agent.py` |
| Audio Analysis | `audio_analysis_agent.py` |

`graph.py` compiles a LangGraph `StateGraph` with `MemorySaver` checkpointer and routes turns via the Orchestrator planner (`decide_next_stage`). Conversational turns use `_run_agent_turn()` which invokes orchestrator → specialist agent. Resume runs at session init; audio agent runs asynchronously on media uploads (off the conversational hot path, per NFR-3).

Session state is cached in-process (`_session_states`) plus LangGraph checkpoint for memory abstraction compatibility.

## LLM provider

- When `OPENAI_API_KEY` is empty or `ENVIRONMENT=test`, a `FakeLLMProvider` returns deterministic canned responses.
- Question generation is adaptive: prompts include conversation history, recent scores, and weak areas to adjust difficulty.

## Refresh token storage

- Refresh tokens are hashed with SHA-256 (not bcrypt) before storage, since bcrypt generates non-deterministic hashes unsuitable for lookup.

## Database migrations

- Tables are created via SQLAlchemy `create_all` on app startup for simplicity. Alembic is configured; the initial migration is a no-op placeholder.

## PDF resume parsing

- PyPDF2 extracts text from PDFs. DOCX uses `python-docx`. Fake/minimal PDF content in tests still triggers the resume agent's fake parser.

## WebSocket + REST dual path

- **Text answers (WS connected):** WebSocket only — no duplicate REST submit.
- **Text answers (WS disconnected):** REST fallback.
- **Audio:** REST upload → background media agents → `graph.submit_answer()` → WS broadcast evaluation + next question.
- `session_complete` is pushed when the orchestrator reaches the learning/completion stage.

## Consent for recording

- Interview console shows an explicit consent banner before audio recording is enabled.

## Auth bypass for development

- `VITE_SKIP_AUTH=true` auto-logs in a demo user. Set to `false` for real login/signup via `LoginPage` / `SignupPage`.

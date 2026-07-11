# AI Technical Interview Coach

An AI-powered platform for realistic, adaptive mock technical interviews. Candidates upload a resume, go through live interview sessions with dynamic follow-ups, and receive personalized learning plans and progress tracking.

## Architecture

- **Backend:** FastAPI + SQLAlchemy + LangGraph multi-agent orchestration (8 agents)
- **Frontend:** React 18 + TypeScript + Vite + TanStack Query + Zustand
- **Database:** SQLite (dev) / PostgreSQL (prod)

## Quick Start

### 1. Start Backend (uvicorn) — run this first

Open a terminal and run **all lines** (Windows PowerShell):

```powershell
cd backend
conda activate ai-interview
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

macOS / Linux:

```bash
cd backend
conda activate ai-interview
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:
- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

Optional — seed demo user (separate terminal, backend running):

```powershell
cd backend
conda activate ai-interview
python -m app.seed
```

Demo login: `demo@example.com` / `demo12345`

### 2. Start Frontend

Open a **second** terminal:

```powershell
cd frontend
npm run dev
```

App: http://localhost:5173 (or 5174 if 5173 is busy)

---

### Backend (Conda) — first-time setup only

```bash
cd backend

# 1. Create conda environment (Python 3.11)
conda create -n ai-interview python=3.11 -y

# 2. Activate environment
conda activate ai-interview

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env from example
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux

# 5. Generate SECRET_KEY and paste into .env
python -c "import secrets; print(secrets.token_urlsafe(32))"

# 6. (Optional) Seed demo data — run after backend is up
python -m app.seed
```

> **Every day:** use [Start Backend (uvicorn)](#1-start-backend-uvicorn--run-this-first) above — you only need setup once.

**Run backend tests:**

```bash
cd backend
conda activate ai-interview
pytest
```

> If `conda activate` fails on Windows, run `conda init powershell`, restart the terminal, then try again.

More backend details: [`backend/README.md`](backend/README.md)

### Frontend (npm)

**Prerequisites:** Node.js 18+ and npm installed.

**First-time setup** (run once):

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Create .env from example
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux
```

Default `.env` values (backend must be running on port 8000):

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
VITE_SKIP_AUTH=true
```

With `VITE_SKIP_AUTH=true`, login/signup is skipped and the app auto-uses the demo account (`demo@example.com`). Run `python -m app.seed` in backend first, or the app will try to register that user automatically.

**Run frontend** (every time):

```bash
cd frontend
npm run dev
```

- App: http://localhost:5173

**Other useful commands:**

```bash
cd frontend
npm run build      # production build
npm run preview    # preview production build
npm test           # run tests
```

> Run commands from the `frontend/` folder, not the project root.

More frontend details: [`frontend/README.md`](frontend/README.md)

**Demo account** (after backend seed): `demo@example.com` / `demo12345`

## Agents (8)

| Agent | Responsibility |
|-------|----------------|
| Orchestrator | Routes interview flow between specialist agents |
| Technical | Role/skill-relevant technical questions |
| Follow-up | Probes deeper on weak answers |
| Scenario | Open-ended design/behavioral scenarios |
| Resume | Parses resume to seed skills and context |
| Learning | Post-session improvement plan |
| Audio Analysis | Transcription, clarity, pace, confidence |
| Video Analysis | Engagement, eye contact, posture proxies |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Invalid or expired refresh token` | Hard refresh browser (Ctrl+Shift+R) — app auto re-logins in dev mode |
| `OPTIONS 400` on login | Add your Vite port to `FRONTEND_ORIGINS` in `backend/.env` (e.g. `http://localhost:5174`) |
| `Backend unreachable` banner | Start backend: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` |
| Shows **Guest** instead of user name | Restart backend after fixing `.env`; refresh browser |
| `401` on `/api/sessions` | Login failed — check CORS + `SECRET_KEY` (no inline comments in `.env`) |
| Frontend on port **5174** | Normal when 5173 is busy — backend must allow 5174 in CORS |

## Project Structure

```
ai-interview-coach/
├── backend/     # FastAPI API + agents + tests
├── frontend/    # React SPA
├── DECISIONS.md # Implementation assumptions
└── README.md
```

## Tests

```bash
# Backend (conda env must be active)
cd backend
conda activate ai-interview
pytest

# Frontend
cd frontend
npm test
```


cd backend
conda activate ai-interview
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Backend — AI Technical Interview Coach

FastAPI backend with JWT auth, interview session management, multi-agent orchestration, and audio/video analysis.

## Conda Environment Setup (run manually)

```bash
cd backend

# Create conda environment with Python 3.11
conda create -n ai-interview python=3.11 -y

# Activate the environment
conda activate ai-interview

# Install dependencies
pip install -r requirements.txt
```

## Configuration

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Long random string for JWT signing |
| `DATABASE_URL` | Default: `sqlite+aiosqlite:///./app.db` |
| `OPENAI_API_KEY` | Optional — uses fake LLM provider if empty |
| `FRONTEND_ORIGIN` | Default: `http://localhost:5173` |

Generate a secret key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Run (uvicorn — start the API server)

```bash
cd backend
conda activate ai-interview
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Windows PowerShell (same commands):

```powershell
cd backend
conda activate ai-interview
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs  
Health: http://localhost:8000/api/health

## Seed Demo Data

```bash
python -m app.seed
```

Creates `demo@example.com` / `demo12345` with a completed session.

## Migrations

Tables are auto-created on startup. For Alembic:

```bash
alembic upgrade head
```

## Tests

```bash
conda activate ai-interview
pytest
pytest --cov=app --cov-report=html
```

All LLM/Whisper calls are mocked in tests — no network required.

## API Error Format

All errors return:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

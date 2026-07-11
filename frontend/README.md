# Frontend — AI Technical Interview Coach

React + TypeScript SPA for the interview coach platform.

## Prerequisites

- Node.js 18 or newer
- npm (comes with Node.js)
- Backend API running at http://localhost:8000

## First-time setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env from example
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend REST API |
| `VITE_WS_BASE_URL` | `ws://localhost:8000` | WebSocket for live interview |

## Run (development)

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

## Build & preview

```bash
cd frontend
npm run build
npm run preview
```

## Tests

```bash
cd frontend
npm test
```

## Full local stack

Use two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
conda activate ai-interview
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

## Troubleshooting

- **`ENOENT package.json` in project root:** You ran npm from the wrong folder. Always `cd frontend` first.
- **Backend unreachable banner:** Start the backend on port 8000 before using the app.
- **WebSocket disconnected:** Log in again (clear `localStorage` key `auth-storage` if using old mock session).

## Error handling

API errors use `error.error.message` from the backend's uniform error shape. The Axios client in `src/api/client.ts` handles 401 refresh automatically.

## Routes

| Path | Page |
|------|------|
| `/` | Landing |
| `/login`, `/signup` | Auth |
| `/onboarding` | Resume upload |
| `/dashboard` | Session list |
| `/interview/:sessionId` | Live interview console |
| `/sessions/:sessionId/report` | Post-interview report |
| `/progress` | Progress charts |
| `/learning-plan` | Learning resources |
| `/profile` | Account settings |

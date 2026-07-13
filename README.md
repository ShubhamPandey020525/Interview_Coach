# 🤖 AI Technical Interview Coach

An intelligent, full-stack, AI-powered mock interview simulator designed to help candidates prepare for technical and behavioral interviews. By leveraging a multi-agent AI system, the simulator generates resume-specific, adaptive questions and performs real-time multimodal (audio/video/text) evaluation to deliver highly detailed performance analytics and custom learning paths.

---

## 🌟 Key Capabilities & Features

### 👤 1. Resume-Driven Live Questioning
*   **Zero Generic Questions**: The system parses your PDF or Word resume at session start and tailors every single question specifically to your projects, tech stack, and experience.
*   **Contextual Scenarios**: Behavioral and architecture scenarios are designed specifically around the tools and frameworks listed on your resume.

### 🧠 2. Adaptive AI Orchestration (LangGraph)
*   **Dynamic Specialist Agents**: An orchestrator monitors your performance and routes the conversation dynamically to different specialists (e.g., technical deep dive, behavioral scenario, follow-up probe).
*   **Intelligent Follow-ups**: If your answer receives a low score (less than 65/100), the system automatically triggers a follow-up agent to probe deeper into the concept, mimicking real interviewer behavior.

### 🎙️ 3. Multimodal Communication Feedback
*   **Speech-to-Text Transcription**: Powered by OpenAI Whisper to transcribe audio/video responses seamlessly.
*   **Audio Analysis**: Automatically calculates speech metrics, including:
    *   **Pace Tracking**: Words Per Minute (WPM) detection.
    *   **Filler Words**: Identifies filler word count (e.g., "uhm", "like", "actually").
    *   **Communication Confidence**: Assess speech clarity and tone.
*   **Computer Vision (MediaPipe + OpenCV)**: Analyzes video input to track engagement proxies like face presence, eye-contact ratio, and posture stability.

### 📊 4. Deep Performance Analytics & Reports
*   **Real-time WebSocket Loop**: Syncs your submissions and live evaluations over a WebSocket connection.
*   **Analytics Dashboard**: Visualizes your performance trends over time using interactive graphs.
*   **Custom Learning Paths**: Generates targeted learning plans pinpointing weak areas, with links to recommended resources.

---

## 🗺️ Multi-Agent Architecture

The core of the application is a **LangGraph StateGraph** that orchestrates 8 specialized AI agents:

```mermaid
graph TD
    A[Start Session] --> B[Resume Agent: Parses Resume & Skills]
    B --> C[Interview Orchestrator Agent]
    C -->|Route Turn| D[Technical Agent: Tailored Qs]
    C -->|Route Turn| E[Follow-up Agent: Deeper Probe if score < 65]
    C -->|Route Turn| F[Scenario Agent: System Design/Behavioral]
    D & E & F --> G[Candidate Response]
    G -->|Text Answer| H[LLM Technical & Communication Score]
    G -->|Audio/Video Upload| I[Audio Agent: Clarity & Pace]
    G -->|Audio/Video Upload| J[Video Agent: Eye Contact & Posture]
    I & J --> H
    H --> C
    C -->|Target Qs Reached (8)| K[Learning Agent: Final Report & Learning Plan]
```

### The 8 Specialized Agents:

| Agent | Module | Description |
| :--- | :--- | :--- |
| **Interview Orchestrator** | [orchestrator.py](file:///c:/Users/pande/Interview_Coach/backend/app/agents/orchestrator.py) | Manages conversational flow, evaluates answers, and decides the next agent stage dynamically. |
| **Technical Specialist** | [technical_agent.py](file:///c:/Users/pande/Interview_Coach/backend/app/agents/technical_agent.py) | Generates role-relevant technical questions and adjusts difficulty based on previous scores. |
| **Follow-up Agent** | [followup_agent.py](file:///c:/Users/pande/Interview_Coach/backend/app/agents/followup_agent.py) | Probes deeper into weak candidate responses to evaluate depth of knowledge (triggers if score < 65). |
| **Scenario Agent** | [scenario_agent.py](file:///c:/Users/pande/Interview_Coach/backend/app/agents/scenario_agent.py) | Issues real-world system design and behavioral tasks at set intervals. |
| **Resume Parser** | [resume_agent.py](file:///c:/Users/pande/Interview_Coach/backend/app/agents/resume_agent.py) | Extracts and structures skills, projects, and work experience from the candidate's upload. |
| **Learning Agent** | [learning_agent.py](file:///c:/Users/pande/Interview_Coach/backend/app/agents/learning_agent.py) | Aggregates session results and builds custom learning paths to bridge performance gaps. |
| **Audio Analysis** | [audio_analysis_agent.py](file:///c:/Users/pande/Interview_Coach/backend/app/agents/audio_analysis_agent.py) | Extracts communication metrics (clarity, pace, filler words) off-hot-path from audio answers. |
| **Video Analysis** | [video_analysis_agent.py](file:///c:/Users/pande/Interview_Coach/backend/app/agents/video_analysis_agent.py) | Uses CV to capture face presence, posture, and engagement metrics. |

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | React 19, Vite 8, TypeScript, Tailwind CSS v4, Zustand, React Query, Recharts, Axios |
| **Backend** | FastAPI (async), Python 3.11, SQLAlchemy (asyncio), Uvicorn, SQLite/PostgreSQL (aiosqlite/asyncpg) |
| **AI / ML** | LangGraph, LangChain, OpenAI API (GPT-4o-mini & Whisper), MediaPipe (FaceMesh & Pose), OpenCV |
| **Testing** | Pytest (async), Vitest, Mock Service Worker (MSW) |

---

## 📂 Repository Structure

```
Interview_Coach/
├── backend/            # FastAPI Backend Service
│   ├── app/
│   │   ├── agents/     # 8 AI agents & LangGraph workflow configuration
│   │   ├── api/        # REST controllers and WebSocket routes
│   │   ├── core/       # Security, token management, generic schemas
│   │   ├── models/     # SQLAlchemy Database Models
│   │   ├── services/   # Media extraction, transcription, & computer vision
│   │   └── seed.py     # Database seeding scripts
│   └── tests/          # Pytest suite
├── frontend/           # React SPA Frontend
│   ├── src/
│   │   ├── components/ # Reusable UI components & layouts
│   │   ├── pages/      # Route pages (Console, Dashboard, Report, Onboarding)
│   │   ├── hooks/      # Custom state, routing, and speech hooks
│   │   └── api/        # Axios API client & WebSocket configurations
│   └── tsconfig.json   
├── DECISIONS.md        # Architectural log & implementation notes
└── README.md           # Main documentation
```

---

## ⚙️ First-Time Installation & Setup

Follow these steps to set up the complete stack on your local machine.

### 1. Clone the Repository
```bash
git clone https://github.com/ShubhamPandey020525/Interview_Coach.git
cd Interview_Coach
```

### 2. Backend Setup
Create your environment and install dependencies:

```bash
# 1. Navigate into the backend folder
cd backend

# 2. Create a new Conda environment
conda create -n ai-interview python=3.11 -y

# 3. Activate the environment
conda activate ai-interview

# 4. Install all dependencies
pip install -r requirements.txt

# 5. Create env configuration file
# For Windows:
copy .env.example .env
# For macOS / Linux:
cp .env.example .env

# 6. Generate a secure secret key and paste it into SECRET_KEY in backend/.env
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

> [!TIP]
> Open your newly created `backend/.env` file and update `SECRET_KEY` with the output of the command above. By default, `OPENAI_API_KEY` is optional and fallback mocks will be used if it is empty.

### 3. Frontend Setup
In a new terminal window, navigate to the frontend directory:

```bash
# 1. Navigate into the frontend folder
cd frontend

# 2. Install Node dependencies
npm install

# 3. Create env configuration file
# For Windows:
copy .env.example .env
# For macOS / Linux:
cp .env.example .env
```

---

## ▶️ Running the Application

Launch the backend and frontend services in separate terminal windows.

### Terminal 1: Start the Backend (FastAPI)
```bash
cd backend
conda activate ai-interview
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
*   **Swagger API Docs**: http://localhost:8000/docs
*   **Health Status API**: http://localhost:8000/api/health

#### Seed the Database (Required for first-time runs)
With the backend running, execute this command in a new terminal with the environment activated to seed the demo account:
```bash
cd backend
conda activate ai-interview
python -m app.seed
```
*   **Demo Account Credentials**:
    *   **Email**: `demo@example.com`
    *   **Password**: `demo12345`

### Terminal 2: Start the Frontend (Vite)
```bash
cd frontend
npm run dev
```
*   **Application URL**: http://localhost:5173 (or http://localhost:5174 if the port is in use)

---

## 🧪 Testing

### Backend Tests
Verify the multi-agent graph, auth middleware, and APIs:
```bash
cd backend
conda activate ai-interview
pytest
```

### Frontend Tests
Verify the components and routing pages:
```bash
cd frontend
npm test
```

---

## 💡 Troubleshooting

| Problem | Explanation & Action |
| :--- | :--- |
| **`OPTIONS 400` / CORS Errors** | Update the `cors_origins` in your `backend/.env` to include your exact Vite frontend URL (e.g., `http://localhost:5174`). |
| **Backend Unreachable Banner** | Double-check that your FastAPI backend is running on `http://localhost:8000`. |
| **WebSocket Connection Closed** | Ensure you are logged in. Try clearing browser cache / `localStorage` (`auth-storage` key) and logging in again. |
| **MediaPipe / Camera issues** | Ensure your camera permissions are granted. A visual fallback will mock the metrics if dependencies are unavailable. |

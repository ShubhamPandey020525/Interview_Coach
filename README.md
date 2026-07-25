# 🤖 AI Technical Interview Coach

An AI-powered mock interview system built with **FastAPI**, **React**, and **LangGraph**. The platform uses a multi-agent AI framework to parse candidate resumes, generate role-tailored technical and behavioral questions, evaluate spoken or typed answers, and deliver personalized learning plans.

---

## 🌟 Overview

The AI Technical Interview Coach simulates real-world job interviews. Instead of generic questions, the system reads your resume skills and projects to ask grounded, relevant questions. It adapts question difficulty based on your performance, probes deeper when an answer is weak, and provides detailed feedback including score, model answer, speech pace, and filler word breakdown.

---

## 🤖 The 8 AI Agents and Their Roles

The core engine is powered by **LangGraph** with 8 specialized AI agents working together:

| # | Agent Name | File | Role & Responsibility |
|---|---|---|---|
| **1** | **Orchestrator Agent** | [`orchestrator.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/orchestrator.py) | **Interview Supervisor & Planner**. Manages state transitions, tracks question limits, and decides which agent should handle the next turn (e.g. Technical, Follow-up, Scenario, or Learning). |
| **2** | **Resume Agent** | [`resume_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/resume_agent.py) | **Context Initializer**. Parses PDF/DOCX resumes at session startup, extracting candidate skills, tech stack keywords, and project details so all questions stay grounded in candidate experience. |
| **3** | **Technical Agent** | [`technical_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/technical_agent.py) | **Technical Examiner**. Generates role-specific coding, system design, and computer science questions matched to the candidate's target role and resume skills. |
| **4** | **Follow-up Agent** | [`followup_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/followup_agent.py) | **Deep Probe Specialist**. Automatically triggered when a candidate's answer score is below 65% or incomplete. Probes deeper into weak technical areas to test true comprehension. |
| **5** | **Scenario Agent** | [`scenario_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/scenario_agent.py) | **System Architecture & Situational Specialist**. Asks open-ended production trade-off, architectural design, and practical problem-solving scenarios based on the resume tech stack. |
| **6** | **Personality Agent** | [`personality_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/personality_agent.py) | **Behavioral & HR Specialist**. Asks questions about past project challenges, team collaboration, leadership experience, and soft skills. |
| **7** | **Learning Agent** | [`learning_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/learning_agent.py) | **Post-Interview Coach**. Runs when the interview completes (max questions reached). Aggregates scores, identifies weak areas, and builds a personalized learning plan with study resources. |
| **8** | **Audio Analysis Agent** | [`audio_analysis_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/audio_analysis_agent.py) | **Voice & Speech Analyst**. Processes recorded candidate voice responses off the main thread. Measures Speech Pace (WPM), counts filler words (`um`, `uh`, `like`), and computes clarity/confidence scores. |

---

## 🔄 How the Multi-Agent System Works

```mermaid
flowchart TD
    Start([1. Candidate Starts Interview]) --> Resume[Resume Agent: Extracts Skills & Projects]
    Resume --> Orch[Orchestrator Agent: Routes Turn]
    
    Orch -->|Technical Stage| Tech[Technical Agent]
    Orch -->|Weak Score < 65%| Followup[Follow-up Agent]
    Orch -->|System Design| Scenario[Scenario Agent]
    Orch -->|Behavioral / HR| Personality[Personality Agent]
    
    Tech & Followup & Scenario & Personality --> CandidateAnswer[Candidate Responds via Text / Voice]
    
    CandidateAnswer -->|Audio Recording| AudioAgent[Audio Analysis Agent: Whisper Speech-to-Text & WPM/Filler Metrics]
    CandidateAnswer -->|Text Answer| LLMEval[LLM Answer Evaluator: Score, Reasoning & Comparison]
    
    AudioAgent --> LLMEval
    LLMEval --> PushResult[Broadcast Feedback & Evaluation to UI]
    PushResult --> Orch
    
    Orch -->|10 Questions Completed| Learning[Learning Agent: Generate Personal Learning Plan]
    Learning --> Complete([Interview Complete / Final Session Report])
```

---

## 📡 How Responses Are Processed & Delivered

The application uses a **dual-path communication model** (WebSockets for live real-time interaction and REST for file/media handling):

### 1. Asking a Question (AI → Candidate)
1. The **Orchestrator** picks the next agent node.
2. The chosen agent (e.g., Technical Agent) generates a question using LLM grounded in candidate resume skills.
3. The question text is sanitized and passed to **Edge-TTS** (Text-to-Speech) to generate a natural voice audio clip.
4. The question text and audio URL are sent to the frontend via WebSockets.

### 2. Answering via Text (Candidate → AI)
1. Candidate types an answer and submits it.
2. The answer is evaluated by the LLM against target scoring rubrics (Score 0-100, Reasoning, Model Answer, Comparison).
3. Evaluation results are updated in session state and pushed back instantly over WebSockets.

### 3. Answering via Voice / Audio (Candidate → AI)
1. Candidate records their spoken answer in the browser.
2. The `.webm` audio file is uploaded to `/api/sessions/{session_id}/answer`.
3. **Audio Analysis Agent** transcribes the speech to text using **Whisper**, calculates speaking pace (WPM), and counts filler words (`um`, `uh`, `like`, `you know`, `basically`).
4. The transcribed text is sent to LLM for technical evaluation.
5. Combined scores (technical + speech clarity + filler metrics) are broadcast back to the frontend in real time via WebSockets.

### 4. Generating the Final Report & Learning Plan
1. Once 10 questions are completed, the Orchestrator routes state to the **Learning Agent**.
2. The **Learning Agent** synthesizes candidate performance, identifies top weak areas, and generates recommended learning resources.
3. The candidate is redirected to the **Session Report Page** showing overall score breakdown, strengths, weaknesses, attempt timeline, and personalized study links.

---

## 🛠️ Technology Stack

- **Backend**: Python 3.11, FastAPI, LangGraph, OpenAI / Gemini LLM API, Faster-Whisper (STT), Edge-TTS (TTS), OpenCV & MediaPipe (Computer Vision).
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Zustand (State Management), TanStack React Query, Recharts (Analytics Charts).
- **Data & Storage**: In-Memory Transient Store (`app/store.py`), zero database installation required.

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.11
- Node.js 18+

### 1. Setup & Run Backend

```bash
cd backend

# Create & activate environment
conda create -n ai-interview python=3.11 -y
conda activate ai-interview

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Run FastAPI Server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

FastAPI Server runs at: `http://localhost:8000` (API Docs at `http://localhost:8000/docs`).

### 2. Setup & Run Frontend

In a new terminal window:

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Run Vite Dev Server
npm run dev
```

Frontend Application runs at: `http://localhost:5173`.

---

## 🧪 Testing

Run backend tests:
```bash
cd backend
conda activate ai-interview
pytest
```

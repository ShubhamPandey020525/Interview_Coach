# 🤖 AI Technical Interview Coach

An AI-powered mock interview system built with **FastAPI**, **React**, and **LangGraph**. The platform uses a multi-agent AI framework to parse candidate resumes, generate role-tailored technical and behavioral questions, evaluate spoken or typed answers, and deliver personalized learning plans.

---

## 🌟 Overview

The AI Technical Interview Coach simulates real-world job interviews. Instead of generic questions, the system reads your resume skills and projects to ask grounded, relevant questions. It adapts question difficulty based on your performance, probes deeper when an answer is weak, and provides detailed feedback including score, model answer, speech pace, and filler word breakdown.

---

## 🤖 The 8 AI Agents and Their Roles

The core engine is powered by **LangGraph** with 8 specialized AI agents working together:

| # | Agent Name | File | Type | Role & Responsibility |
|---|---|---|---|---|
| **1** | **Orchestrator Agent** | [`orchestrator.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/orchestrator.py) | Logic | **Interview Supervisor & Planner**. Manages state transitions, tracks question limits, and decides which agent should handle the next turn (e.g. Technical, Follow-up, Scenario, or Learning). |
| **2** | **Resume Agent** | [`resume_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/resume_agent.py) | LLM | **Context Initializer**. Parses PDF/DOCX resumes at session startup, extracting candidate skills, tech stack keywords, and project details so all questions stay grounded in candidate experience. |
| **3** | **Technical Agent** | [`technical_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/technical_agent.py) | LLM | **Technical Examiner**. Generates role-specific coding, system design, and computer science questions matched to the candidate's target role and resume skills. |
| **4** | **Follow-up Agent** | [`followup_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/followup_agent.py) | LLM | **Deep Probe Specialist**. Automatically triggered when a candidate's answer score is below 65% or incomplete. Probes deeper into weak technical areas to test true comprehension. |
| **5** | **Scenario Agent** | [`scenario_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/scenario_agent.py) | LLM | **System Architecture & Situational Specialist**. Asks open-ended production trade-off, architectural design, and practical problem-solving scenarios based on the resume tech stack. |
| **6** | **Personality Agent** | [`personality_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/personality_agent.py) | LLM | **Behavioral & HR Specialist**. Asks questions about past project challenges, team collaboration, leadership experience, and soft skills. |
| **7** | **Learning Agent** | [`learning_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/learning_agent.py) | LLM | **Post-Interview Coach**. Runs when the interview completes (max questions reached). Synthesizes candidate scores and resume skill gaps to generate a personalized learning plan. |
| **8** | **Audio Analysis Agent** | [`audio_analysis_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/audio_analysis_agent.py) | Engine | **Voice & Speech Analyst**. Processes recorded candidate voice responses off the main thread. Measures Speech Pace (WPM), counts filler words (`um`, `uh`, `like`), and computes clarity/confidence scores. |

---

### 🛠️ Agent Infrastructure & Helper Files

Besides the 8 conversational agents, the agent system includes 4 infrastructure and utility files:

| File | Type | Purpose & Functionality |
|---|---|---|
| [`graph.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/graph.py) | Engine | **LangGraph Compiler & Registry**. Assembles state nodes into a `StateGraph`, manages session state checkpointers (`MemorySaver`), and exports `AGENT_REGISTRY`. |
| [`state.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/state.py) | Schema | **Shared State Interface**. Defines `InterviewState` (TypedDict) shared across all agents to store scores, question count, and resume context. |
| [`resume_context.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/resume_context.py) | Helper | **Context Validation Utility**. Verifies that candidate resume skills and projects exist before starting an interview (`is_resume_context_sufficient`). |
| [`video_analysis_agent.py`](file:///c:/Users/pande/Interview_Coach/backend/app/agents/video_analysis_agent.py) | Helper | **Vision Analysis Node**. Evaluates candidate posture stability and face engagement using MediaPipe and OpenCV. |

---

## 🔄 Sequential Multi-Agent Execution Flow

```mermaid
flowchart TD
    Start([1. Candidate Starts Session]) --> Resume[Step 1: Resume Agent - Extract Skills & Projects]
    Resume --> Orch[Step 2: Orchestrator Agent - Evaluate State & Select Next Turn]
    
    Orch -->|Technical Stage| Tech[Step 3: Technical Agent - Core Technical Qs]
    Orch -->|Weak Score < 65%| Followup[Step 4: Follow-up Agent - Deep Probe Qs]
    Orch -->|System Design| Scenario[Step 5: Scenario Agent - Production Trade-off Qs]
    Orch -->|Behavioral / HR| Personality[Step 6: Personality Agent - Behavioral Qs]
    
    Tech & Followup & Scenario & Personality --> CandidateAnswer[Candidate Responds via Text or Voice]
    
    CandidateAnswer -->|Audio Upload| AudioAgent[Step 7: Audio Analysis Agent - Whisper STT & WPM/Filler Metrics]
    CandidateAnswer -->|Text Answer| LLMEval[LLM Answer Evaluator - Score, Reasoning & Comparison]
    
    AudioAgent --> LLMEval
    LLMEval --> Orch
    
    Orch -->|10 Questions Completed| Learning[Step 8: Learning Agent - Synthesize Personalized Learning Plan]
    Learning --> Complete([Interview Complete - Final Session Report Delivered])
```

---

## ⚙️ How Each Agent Operates (LLM Prompts vs Non-LLM Logic)

---

### 🟢 Non-LLM Agents (State Logic & Audio Engine)

#### 1. Orchestrator Agent (`orchestrator.py`) — *State Machine Logic*
- **Mechanism**: Operates using deterministic Python state logic (no LLM calls required).
- **Operation**: Evaluates current `question_count` and recent score. If `question_count >= 10`, it routes to the **Learning Agent**; if previous score `< 65`, it routes to the **Follow-up Agent**; otherwise, it cycles through **Technical**, **Scenario**, and **Personality** stages based on the planned question sequence.

#### 2. Audio Analysis Agent (`audio_analysis_agent.py`) — *Whisper STT & Audio Math*
- **Mechanism**: Runs speech processing off the main conversational thread using local models (no LLM calls).
- **Operation**:
  - Uses local **OpenAI Whisper STT** (`faster-whisper` C++ engine) to transcribe `.webm` voice audio into text.
  - Computes Speech Pace in Words Per Minute (`WPM = word_count / duration_minutes`).
  - Matches spoken words against filler vocabulary (`um`, `uh`, `like`, `you know`, `basically`) to calculate filler count and communication clarity.

---

### 🤖 LLM-Powered Agents (Prompts Sent to LLM)

#### 1. Resume Agent (`resume_agent.py`)
- **Role**: Parses raw uploaded resume text into structured skills and project subtopics.
- **LLM Prompt**:
  ```python
  prompt = f"""
  Extract ONLY what is explicitly stated in this resume text. Do not invent skills.
  For each extracted skill, generate 5-8 core technical subtopics.
  Raw Resume Text: {raw_text}
  Return JSON: {{"skills": [...], "projects": [...], "experience_summary": "...", "skill_subtopics": {{...}}}}
  """
  ```

---

#### 2. Technical Agent (`technical_agent.py`)
- **Role**: Generates role-relevant technical interview questions grounded in candidate resume skills.
- **LLM Prompt**:
  ```python
  prompt = f"""
  You are a senior technical interviewer for a {target_role} role.
  ASSIGNMENT: Ask a technical question on specific topic: '{topic}' with angle: '{angle}'.
  Question Type: {question_type}
  Candidate Resume Context: {json.dumps(resume_context)}
  Conversation History: {json.dumps(conversation_history[-4:])}
  Return JSON: {{"question": "your single resume-specific question here"}}
  """
  ```

---

#### 3. Follow-up Agent (`followup_agent.py`)
- **Role**: Triggered automatically when the candidate's previous score is `< 65/100`.
- **LLM Prompt**:
  ```python
  prompt = f"""
  You are a senior technical interviewer for a {target_role} role.
  ASSIGNMENT: Candidate's previous answer was weak. Ask a follow-up question on the SAME topic.
  Original Question: {question_text}
  Candidate Answer: {answer_text}
  Why Answer Was Weak: {reasoning}
  Candidate Resume Context: {json.dumps(resume_context)}
  Return JSON: {{"question": "your single resume-specific follow-up question here"}}
  """
  ```

---

#### 4. Scenario Agent (`scenario_agent.py`)
- **Role**: Generates open-ended system design and production trade-off scenario questions.
- **LLM Prompt**:
  ```python
  prompt = f"""
  Generate an open-ended system design or production scenario question for a {target_role}.
  Resume Tech Stack: {json.dumps(resume_context)}
  Weak Areas: {weak_areas}
  Return JSON: {{"question": "your single resume-specific scenario question here"}}
  """
  ```

---

#### 5. Personality Agent (`personality_agent.py`)
- **Role**: Generates soft skills, teamwork, and past project challenge questions.
- **LLM Prompt**:
  ```python
  prompt = f"""
  Generate a behavioral / soft skills interview question for a {target_role}.
  Resume Projects & Experience: {json.dumps(resume_context.get('projects'))}
  Focus on leadership, team collaboration, or handling project bottlenecks.
  Return JSON: {{"question": "your single resume-specific behavioral question here"}}
  """
  ```

---

#### 6. Answer Evaluator (LLM Scoring Rubric)
- **Role**: Evaluates candidate answer quality after each turn.
- **LLM Prompt**:
  ```python
  prompt = f"""
  Evaluate this {agent_type} interview answer thoroughly.
  Question: {question}
  Candidate Answer: {answer}
  Resume Context: {json.dumps(resume_context)}
  Return JSON: {{"metrics": {{"clarity": 5, "relevance": 5, "technical_depth": 5}}, "reasoning": "...", "best_answer": "...", "user_answer_comparison": "..."}}
  """
  ```

---

#### 7. Learning Agent (`learning_agent.py`)
- **Role**: Runs when 10 questions are completed to build a personalized study plan.
- **LLM Prompt**:
  ```python
  prompt = f"""
  Create a personalized learning plan for a {target_role} candidate.
  Resume context: {json.dumps(resume_context)}
  Session weak areas: {weak_areas}
  Session scores: {json.dumps(scores)}
  Recommend resources for skills/projects gaps visible on their resume.
  Return JSON: {{"weak_areas": [...], "recommended_resources": [{{"title":"...","url":"...","type":"..."}}]}}
  """
  ```

---

## 🗣️ Voice Generation (Edge-TTS) & Input Processing

- **Text-to-Speech (Edge-TTS)**: Converts AI questions into high-quality human speech clips (`.mp3`) using personas:
  - `en-US-JennyNeural` (HR/Behavioral)
  - `en-US-ChristopherNeural` (Technical/Follow-up)
  - `en-US-EricNeural` (System Design/Scenario)
  - `gTTS` fallback engine activates automatically if Edge-TTS requests fail.

- **Candidate Input**:
  - **Typed Text**: Evaluated directly by LLM scoring rubrics (0-100 score, reasoning, model answer, comparison).
  - **Spoken Audio**: Transcribed locally via OpenAI Whisper STT (`faster-whisper`), evaluated for speech pace and filler words, then scored by LLM.

---

## 🛠️ Technology Stack

- **Backend**: Python 3.11, FastAPI, LangGraph, OpenAI / Gemini LLM API, OpenAI Whisper STT (`faster-whisper`), Edge-TTS (TTS), OpenCV & MediaPipe (Computer Vision).
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

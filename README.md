# AI Technical Interview Coach

An AI-powered technical and behavioral mock interview simulator. Upload your resume, configure your target role, participate in realistic voice-interactive practice rounds, and receive personalized learning feedback reports!

---

## 📋 Prerequisites
Before setting up the project, ensure you have the following installed:
1. **Python 3.11** (or higher)
2. **Conda** (or Miniconda, for Python environment management)
3. **Node.js 18+** (along with npm, for the React frontend)
4. **Git** (to clone the repository)

---

## 🚀 Step-by-Step Installation

### 1. Clone the Repository
Select your directory of choice and run the following commands:
```bash
git clone https://github.com/ShubhamPandey020525/Interview_Coach.git
cd Interview_Coach
```

### 2. Backend Setup
Navigate into the `backend` folder:

#### a. Create the Conda Environment
```bash
cd backend
conda create -n ai-interview python=3.11 -y
```

#### b. Activate the Conda Environment
**Windows PowerShell:**
```powershell
conda activate ai-interview
```
*(If `conda activate` fails, run `conda init powershell` first, then restart your terminal session.)*

**macOS / Linux:**
```bash
conda activate ai-interview
```

#### c. Install Python Dependencies
```bash
pip install -r requirements.txt
```

#### d. Create the Environment File
Copy the example environment configuration:
**Windows:**
```powershell
copy .env.example .env
```
**macOS / Linux:**
```bash
cp .env.example .env
```

#### e. Generate a Security Secret Key
Run this helper command, copy the output string, and paste it into the `SECRET_KEY` property in your `backend/.env` file:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Frontend Setup
Open a new terminal session and navigate into the `frontend` folder:

#### a. Install Node Dependencies
```bash
cd frontend
npm install
```

#### b. Create the Environment File
Copy the example environment configuration:
**Windows:**
```powershell
copy .env.example .env
```
**macOS / Linux:**
```bash
cp .env.example .env
```

---

## ▶️ Execution (Daily Runs)
Launch the application components in separate terminals:

### Terminal 1: Start the Backend Service
```bash
cd backend
conda activate ai-interview
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- **Backend API Endpoint**: http://localhost:8000
- **Interactive Swagger Documentation**: http://localhost:8000/docs

### Seed the Demo User Profile (First Run)
With the backend service running, execute the following script in a new active environment terminal:
```bash
cd backend
conda activate ai-interview
python -m app.seed
```
**Demo Account Credentials:**
- **Email**: demo@example.com
- **Password**: demo12345

### Terminal 2: Start the Frontend Application
```bash
cd frontend
npm run dev
```
- **Vite Web App URL**: http://localhost:5173 (or http://localhost:5174 if 5173 is occupied)

---

## 🛠️ Troubleshooting & Support

| Common Issue | Troubleshooting Resolution |
|:---|:---|
| `Invalid or expired refresh token` | Perform a browser hard reload (`Ctrl` + `Shift` + `R` or `Cmd` + `Shift` + `R`). |
| `OPTIONS 400` on authorization | Update the `cors_origins` configurations in `backend/.env` to include your exact Vite local URL port (e.g. `http://localhost:5174`). |
| `Backend unreachable` status banner | Ensure the FastAPI server is running: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`. |
| Console displays "Guest" name | Check for inline comments in `.env` configurations that might disrupt parser loaders, and restart the backend. |
| `401 Unauthorized` on `/api/sessions` | Verify CORS origins mapping and make sure `SECRET_KEY` is fully configured in the backend's `.env`. |

---

## 📁 Repository Structure
```
Interview_Coach/
├── backend/     # FastAPI service, Graph Agents, media storage & unit tests
├── frontend/    # React SPA dashboard, layout structures & speech hooks
├── DECISIONS.md # Architectural assumptions and decisions
└── README.md
```

---

## 🧪 Verification & Tests

### Execute Backend Tests
```bash
cd backend
conda activate ai-interview
pytest
```

### Execute Frontend Tests
```bash
cd frontend
npm test
```

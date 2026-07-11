# AI Technical Interview Coach

AI se chalne wala platform jisse aap realistic mock technical interviews de sakte ho! Resume upload karo, live interview sessions attend karo, aur personalized learning plans milte rahenge!

---

## 📋 Pehle ye check kar lo (Prerequisites)
Project setup karne se pehle ye sab install hona chahiye:
1. **Python 3.11** (ya usse upar)
2. **Conda** (ya Miniconda, Python environment manage karne ke liye)
3. **Node.js 18+** (aur npm, frontend ke liye)
4. **Git** (GitHub se project clone karne ke liye)

---

## 🚀 Step-by-Step Setup (Pehli baar ke liye)

### 1. GitHub se project clone karo
Apne system pe ek jagah choose karo (jaise Desktop ya Documents), phir terminal open karke ye command run karo:
```bash
git clone https://github.com/ShubhamPandey020525/Interview_Coach.git
cd Interview_Coach
```

### 2. Backend Setup
Terminal open karo, aur `backend` folder me jao:

#### a. Conda environment create karo
```bash
cd backend
conda create -n ai-interview python=3.11 -y
```

#### b. Environment activate karo
**Windows PowerShell:**
```powershell
conda activate ai-interview
```
*(Agar `conda activate` kaam na kare, pehle `conda init powershell` run karke terminal restart karo)*

**macOS/Linux:**
```bash
conda activate ai-interview
```

#### c. Dependencies install karo
```bash
pip install -r requirements.txt
```

#### d. .env file create karo
`.env.example` ko copy karke `.env` banao:
**Windows:**
```powershell
copy .env.example .env
```
**macOS/Linux:**
```bash
cp .env.example .env
```

#### e. SECRET_KEY generate karo
Ye command run karke ek secret key generate karo, aur usse `.env` file me `SECRET_KEY` ke jagah paste karo:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Frontend Setup
Naya terminal open karo, aur `frontend` folder me jao:

#### a. Dependencies install karo
```bash
cd frontend
npm install
```

#### b. .env file create karo
`.env.example` ko copy karke `.env` banao:
**Windows:**
```powershell
copy .env.example .env
```
**macOS/Linux:**
```bash
cp .env.example .env
```

---

## ▶️ Project Chalao (Har baar)
Do terminals open karo (ek backend ke liye, ek frontend ke liye):

### Terminal 1: Backend Start Karo
```bash
cd backend
conda activate ai-interview
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- Backend API: http://localhost:8000
- Swagger Docs (API test karne ke liye): http://localhost:8000/docs

### (Optional) Demo User Seed Karo
Backend chal raha ho, to naya terminal me ye run karo:
```bash
cd backend
conda activate ai-interview
python -m app.seed
```
Demo login details:
- Email: `demo@example.com`
- Password: `demo12345`

### Terminal 2: Frontend Start Karo
```bash
cd frontend
npm run dev
```
- App: http://localhost:5173 (ya 5174 agar 5173 busy ho)

---

## 🛠️ Troubleshooting (Agar koi problem aaye)
| Problem | Fix |
|---------|-----|
| `Invalid or expired refresh token` | Browser hard refresh karo (Ctrl+Shift+R) |
| `OPTIONS 400` on login | `backend/.env` me `FRONTEND_ORIGINS` me apna Vite port add karo (jaise `http://localhost:5174`) |
| `Backend unreachable` banner | Backend start karo: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` |
| Guest dikhaye instead of user name | Backend restart karo `.env` fix karne ke baad, phir browser refresh |
| `401` on `/api/sessions` | Login fail - CORS aur `SECRET_KEY` check karo (`.env` me inline comments mat rakho) |
| Frontend port 5174 par chal raha | Normal hai jab 5173 busy ho - backend me 5174 ko CORS me allow karo |

---

## 📁 Project Structure
```
Interview_Coach/
├── backend/     # FastAPI API + agents + tests
├── frontend/    # React SPA
├── DECISIONS.md # Implementation assumptions
└── README.md
```

---

## 🧪 Tests Chalao
### Backend Tests
```bash
cd backend
conda activate ai-interview
pytest
```

### Frontend Tests
```bash
cd frontend
npm test
```

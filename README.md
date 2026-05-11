# 📊 DataMind — AI Data Analyst

> Upload any dataset. Clean it. Visualize it. Chat with it.  
> Powered by **Groq** (free) · Built with **FastAPI** + **React**

---

## 🚀 What is DataMind?

DataMind is a full-stack AI-powered data analysis platform that lets anyone
explore, clean, and query datasets using natural language — no code required.

Upload a CSV or Excel file and instantly get quality scores, statistics,
charts, and an AI analyst you can ask anything.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📁 File Upload | CSV, Excel, JSON, TSV, Parquet |
| 🔍 Auto Analysis | Column types, stats, quality score on upload |
| 🧹 Data Cleaning | Fix nulls, duplicates, and outliers in one click |
| 📊 6 Chart Types | Bar, Line, Scatter, Pie, Histogram, Heatmap |
| 🤖 AI Chat | Ask questions in plain English, get exact answers |
| 💡 Quick Actions | Full analysis, insights, anomalies, correlations |
| ⬇ Export | Download cleaned dataset as CSV |

---

## 🛠 Tech Stack

**Backend**
- FastAPI · Pandas · NumPy
- Groq API — Llama 3.1 8B (free tier)

**Frontend**
- React 18 · Vite
- Chart.js · Framer Motion · React Markdown

---

## ⚡ Quick Start

### 1. Clone the repo
git clone https://github.com/yourusername/datamind.git

### 2. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Set environment variable

# Windows (CMD)
set GROQ_API_KEY=your_key_here

# Windows (PowerShell)
$env:GROQ_API_KEY="your_key_here"

# Mac/Linux
export GROQ_API_KEY=your_key_here

# Run backend server
uvicorn app:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start frontend server
npm run dev
```

### 4. Open http://localhost:5173

Get a free Groq API key at https://console.groq.com

---

## 📸 Screenshots

### File Upload

![File Upload](screenshots/file_upload.jpg)

### Overview Dashboard

![Overview](screenshots/overview_.jpg)

### Data Cleaning

![Data Cleaning](screenshots/data_cleaning.jpg)

### Data Visualization

![Visualization](screenshots/visualize.jpg)

### AI Chat

![AI Chat](screenshots/ai-chat.jpg)




## API Endpoints

| Method | Endpoint            | Description                  |
| ------ | ------------------- | ---------------------------- |
| GET    | /health             | Health check                 |
| GET    | /api/test-ai        | Verify AI is working         |
| POST   | /api/upload         | Upload dataset               |
| GET    | /api/data/{id}      | Paginated table              |
| GET    | /api/chart/{id}     | Chart data                   |
| POST   | /api/clean          | Clean dataset                |
| GET    | /api/export/{id}    | Download CSV                 |
| POST   | /api/chat           | AI chat (streaming)          |
| POST   | /api/quick-analysis | Quick AI actions (streaming) |

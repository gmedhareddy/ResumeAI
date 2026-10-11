# ResumeAI

**An intelligent resume analysis, resume building and career guidance system.**

Upload a resume (PDF / DOCX / TXT) and get an ATS score, skill-gap analysis, job-role matching, a personalised career roadmap and an auto-generated portfolio website. Don't have a resume yet? The AI-assisted **Resume Builder** creates an ATS-friendly one from scratch.

Built as a college major project.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Getting Started](#getting-started)
6. [Configuration](#configuration)
7. [API Reference](#api-reference)
8. [Deployment](#deployment)
9. [Limitations](#limitations)
10. [Future Work](#future-work)

---

## Features

### 1. Resume Analyzer (dashboard)
Upload a PDF, DOCX or TXT resume. Text is extracted in the browser (PDF.js / Mammoth.js), then analysed by a local rule-based engine, with AI-backed enrichment from the Flask backend.

| Tab | What it gives you |
|---|---|
| Resume Data | Parsed name, email, phone, education, skills, projects |
| ATS Analysis | ATS score with detailed breakdown and missing keywords |
| Resume Strength | Overall strength score |
| Skill Analysis / Skill Gap | Detected skills vs. skills required for target roles |
| Problems Found | Detected weaknesses in the resume |
| AI Suggestions | Improvement and rewrite suggestions |
| Job Roles | Best-fit roles ranked by confidence |
| Career Guidance | Career direction based on your profile |
| Trending Technologies | Currently in-demand technologies for your target role |
| Career Roadmap | Step-by-step learning path |
| Learning Resources / YouTube Videos | Curated resources for your skill gaps |
| Project Ideas | Portfolio project suggestions |
| Recommended Certificates | Certifications that fit your target role |
| Portfolio Website | Auto-generated portfolio in 5 templates (Midnight Hero, App Shell, Editorial, Minimal, Vivid Grid), downloadable as HTML |
| Download Reports | Full analysis report download |

### 2. AI Resume Builder (11-step wizard)
Personal Info, Summary, Education, Skills (incl. soft skills), Coding Profiles, Projects, Internships, Certifications, Achievements, Languages, Interests.

- **AI fills the gaps**: leave the summary, skills or project descriptions blank and the AI writes or recommends them.
- **8 ATS-safe templates**: Modern, Professional, Minimal, Standard ATS, Google Style, Microsoft Style, Amazon Style, One-Column Pro (no graphics, tables or icons).
- **Export**: PDF, DOCX, Plain Text and ATS Text Version.
- **Company-specific resume**: tailor the resume for a chosen company (TCS, Infosys, Google, Amazon, etc.) using only the candidate's real content.
- **Cover letter** and **LinkedIn summary** generators.
- **Professional Profile Score**: LinkedIn, GitHub and overall score (/100) with recommendations.
- **Resume Quality Checker**: flags passive or weak phrasing, long paragraphs, repeated words and missing links (0-100 score).
- **Branch-wise ATS keywords** for CSE, CSE-AIML, CSE-DS and ECE.
- **Coding profile milestones**: automatic badges for LeetCode, GFG, HackerRank, CodeChef and Codeforces.
- **Drafts**: save and load resume drafts (stored in the browser's `localStorage`).

### 3. Multi-provider AI backend
Claude, OpenAI and Gemini are all supported. If the preferred provider fails or has no key, the backend automatically falls back to the next configured one. API keys stay on the server and never reach the browser. Several builder features also have deterministic local fallbacks, so they keep working without an AI key.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (no framework, no build step) |
| Document parsing | PDF.js, Mammoth.js (loaded from CDN) |
| Document export | docx.js, FileSaver.js |
| Backend | Python 3, Flask 3.0.3, Flask-CORS, python-dotenv, Requests |
| Production server | Gunicorn |
| AI providers | Anthropic Claude, OpenAI, Google Gemini (pluggable) |
| Client storage | Browser `localStorage` |

---

## Architecture

```
┌──────────────────────────── Browser ────────────────────────────┐
│  index.html / app.js          resume-builder.html / .js         │
│  - upload + parse (PDF.js,    - 11-step wizard                  │
│    Mammoth.js)                - templates, export (PDF/DOCX/TXT)│
│  - local analysis engine      - drafts in localStorage          │
└───────────────┬──────────────────────────────┬──────────────────┘
                │ fetch('/api/...')            │
                ▼                              ▼
┌──────────────────────── Flask backend (app.py) ─────────────────┐
│  /api/analyze-resume   /api/chat   /api/generate-roadmap  ...   │
│  /api/builder/*        /api/document-extract                    │
│  Serves the static frontend + JSON API                          │
└───────────────┬─────────────────────────────────────────────────┘
                │  server-side keys only
                ▼
        Claude  ⇄  OpenAI  ⇄  Gemini   (automatic fallback)
```

---

## Project Structure

```
ResumeAI/
├── app.py                 # Flask server: static hosting + all /api/* endpoints
├── requirements.txt       # Python dependencies
├── index.html             # Landing page, auth flow, analysis dashboard
├── app.js                 # Dashboard logic: upload, parsing, analysis, rendering
├── style.css              # Main app styles
├── resume-builder.html    # AI Resume Builder page
├── resume-builder.js      # Wizard, templates, export, scoring tools
├── resume-builder.css     # Builder styles
├── portfolio.html         # Portfolio template (sample data)
├── app-shell.html/.css/.js   # "App Shell" portfolio style
├── editorial.html/.css/.js   # "Editorial" portfolio style
├── portfolio-data.js      # Sample data for the standalone portfolio pages
├── BACKEND_README.md      # Backend-specific notes
└── README.md
```

---

## Getting Started

### Prerequisites
- Python 3.10+ (3.11 recommended)
- At least one AI API key (Claude, OpenAI or Gemini). Optional, since the local analysis engine still works without one.
- Internet access for the CDN scripts (PDF.js, Mammoth.js, docx.js)

### Run locally

```bash
# 1. Clone
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables (see next section)
cp .env.example .env              # or create .env manually

# 5. Start the server
python app.py
```

Open **http://localhost:5000**.

> The frontend is served by Flask itself, so there's no separate frontend server to run.

---

## Configuration

Create a `.env` file in the project root:

```env
# Choose which provider to try first: claude | openai | gemini
AI_PROVIDER=claude

# Set at least one key
CLAUDE_API_KEY=your_key_here
OPENAI_API_KEY=
GEMINI_API_KEY=

# Optional model overrides (defaults shown)
CLAUDE_MODEL=claude-sonnet-4-6
OPENAI_MODEL=gpt-4o-mini
GEMINI_MODEL=gemini-1.5-flash

# Optional server settings
PORT=5000
FLASK_DEBUG=false
```

Never commit your real `.env`. Add it to `.gitignore`:

```bash
echo ".env"          >> .gitignore
echo "venv/"         >> .gitignore
echo "__pycache__/"  >> .gitignore
```

Check which providers are active at `GET /healthz`.

---

## API Reference

All endpoints accept and return JSON.

### Analysis

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/analyze-resume` | ATS score, strengths, weaknesses, missing skills, predicted roles |
| POST | `/api/chat` | Career assistant chat |
| POST | `/api/generate-roadmap` | Learning roadmap for a target role |
| POST | `/api/project-suggestions` | Portfolio project ideas |
| POST | `/api/trending-technologies` | Trending technologies for a role |
| POST | `/api/document-extract` | AI-assisted structured extraction from resume text |

### Resume Builder (`/api/builder/...`)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/generate-summary` | Professional summary |
| POST | `/recommend-skills` | Technical skills for a role |
| POST | `/recommend-soft-skills` | Soft skills for a branch / role |
| POST | `/generate-project-description` | Project description from a title |
| POST | `/generate-experience-bullets` | Internship / experience bullet points |
| POST | `/finalize-resume` | Assemble the final structured resume |
| POST | `/generate-cover-letter` | Cover letter |
| POST | `/generate-linkedin-summary` | LinkedIn "About" section |
| POST | `/company-resume` | Company-tailored resume |
| POST | `/profile-score` | LinkedIn / GitHub / overall profile score |
| POST | `/quality-check` | Deterministic resume quality check |
| GET  | `/branch-keywords` | Branch-wise ATS keyword lists |

### Utility

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/healthz` | Health check and configured providers |

Example:

```js
const res = await fetch('/api/analyze-resume', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: resumeText })
});
const data = await res.json();
```

---

## Deployment

The app is a standard Flask app, so any Python host works. Start command: `gunicorn app:app`.

**Render / Railway**
1. Push the repo to GitHub and create a new Web Service from it.
2. Build command: `pip install -r requirements.txt`
3. Start command: `gunicorn app:app`
4. Add `CLAUDE_API_KEY` (and/or the other keys) as environment variables.

**Azure App Service**
```bash
az webapp up --runtime PYTHON:3.11 --name <app-name>
```
Set the startup command to `gunicorn --bind=0.0.0.0 --timeout 600 app:app`.

**PythonAnywhere**: create a virtualenv, install requirements, and point the WSGI file to `from app import app as application`.

---

## Limitations

- **Authentication is a demo.** The OTP sign-in is generated in the browser and shown on screen; no email is sent and there are no real user accounts.
- **No database.** Resume drafts live in each browser's `localStorage`, so data isn't shared across devices or users.
- **Local analysis is rule-based.** Without an AI key, scoring relies on keyword and regex heuristics, so resumes using unusual wording may score lower than they deserve.
- **LinkedIn / GitHub scores don't scrape profiles.** They're based on link presence, validity and cross-checks with resume content.
- **CDN dependency.** PDF and DOCX parsing needs internet access for PDF.js and Mammoth.js. TXT files work offline.

---

## Future Work

- Real user accounts with a database (PostgreSQL / SQLite) and persistent storage
- College administrator dashboard (branch-wise ATS averages, completion stats, coordinator reports)
- Docker setup for frontend, backend and database
- Wire the Resume Quality Checker into a dashboard tab
- Feed the analyzer's extracted data directly into the portfolio templates

---

## License

Academic project. Add a license of your choice (e.g. MIT) before making the repository public.

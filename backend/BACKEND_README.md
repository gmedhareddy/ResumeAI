# ResumeAI Backend

The Flask backend serves the frontend files from the sibling `frontend/` directory and exposes JSON endpoints under `/api/`. Provider keys are read from environment variables and are never sent to the browser.

## Run locally

From the project root:

```powershell
pip install -r backend/requirements.txt
py backend/app.py
```

The app is available at <http://localhost:5000>. Without configured provider keys, supported builder actions use local fallback responses where available.

## Docker

Use `docker compose up --build` from the project root. The backend runs on the internal Compose network; the frontend Nginx service proxies `/api/` to it and is exposed at <http://localhost:8080>.

## Configuration

Set any needed keys in a root `.env` file:

```dotenv
AI_PROVIDER=claude
CLAUDE_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

Supported provider and model settings include `AI_PROVIDER`, `CLAUDE_MODEL`, `OPENAI_MODEL`, and `GEMINI_MODEL`. Keep `.env` out of version control.

## Useful endpoints

- `GET /healthz` reports backend status and whether provider keys are configured.
- `POST /api/analyze-resume` analyzes resume text.
- `POST /api/chat` provides a career-assistant response.
- `POST /api/generate-roadmap` creates a learning roadmap.
- `POST /api/project-suggestions` suggests portfolio projects.
- `POST /api/builder/*` contains resume-builder generation and quality-check endpoints.
- `POST /api/document-extract` extracts supported document text.

All endpoints are implemented in `app.py`. Requests to provider-backed endpoints can require internet access and may use the configured provider key.
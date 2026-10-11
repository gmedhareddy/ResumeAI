"""
ResumeAI - Flask Backend
=========================
Serves the existing static frontend (unchanged) and exposes secure
server-side API endpoints that call AI providers (Claude / OpenAI / Gemini).

API keys are read from environment variables only. They are never sent to,
or exposed in, the browser/frontend.

Run locally:
    python app.py
"""

import os
import json
import logging

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import requests

# ─────────────────────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────────────────────

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

app = Flask(__name__, static_folder=None)

# CORS is enabled for the /api/* routes. Since the frontend is served by
# this same Flask app, this is mainly useful if you ever host the frontend
# separately (e.g. a different domain) from the backend.
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("resumeai-backend")

# ─────────────────────────────────────────────────────────────
# API keys (server-side only — never exposed to the browser)
# ─────────────────────────────────────────────────────────────

CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Which provider to use by default. Falls back automatically to whichever
# key is actually configured if the preferred one is missing.
AI_PROVIDER = os.environ.get("AI_PROVIDER", "claude").lower()

CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")


class AIProviderError(Exception):
    """Raised when no AI provider is configured or a provider call fails."""


# ─────────────────────────────────────────────────────────────
# Unified AI call helper
# ─────────────────────────────────────────────────────────────

def _call_claude(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.4,
                  enable_web_search: bool = False, timeout: int = 120) -> str:
    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    if enable_web_search:
        # Anthropic-hosted web search tool: executed server-side by Anthropic
        # within this same request, so the model can ground its answer in
        # actual current search results instead of only its training data.
        # max_uses is kept modest (3) so a web-search-grounded call finishes
        # quickly enough to not trip a host/proxy request timeout.
        payload["tools"] = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}]
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json=payload,
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    parts = [b["text"] for b in data.get("content", []) if b.get("type") == "text"]
    return "\n".join(parts).strip()


def _call_openai(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.4) -> str:
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _call_gemini(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.4) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    resp = requests.post(
        url,
        json={
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def call_ai(system_prompt: str, user_prompt: str, max_tokens: int = 2000, temperature: float = 0.4,
            enable_web_search: bool = False, timeout: int = 120) -> str:
    """
    Calls the configured AI provider and returns the raw text response.
    Tries the preferred provider first, then falls back to any other
    provider that has a key configured. Provider-agnostic: the same
    system_prompt/user_prompt work unchanged against Claude, OpenAI, or
    Gemini.

    enable_web_search: when True and the Claude provider is used, lets the
    model ground its answer in live web search results (Anthropic-hosted
    tool). Ignored by the OpenAI/Gemini fallbacks, which just answer from
    model knowledge as before.
    """
    providers = {
        "claude": (CLAUDE_API_KEY, _call_claude),
        "openai": (OPENAI_API_KEY, _call_openai),
        "gemini": (GEMINI_API_KEY, _call_gemini),
    }

    order = [AI_PROVIDER] + [p for p in providers if p != AI_PROVIDER]
    last_error = None

    for name in order:
        key, fn = providers[name]
        if not key:
            continue
        try:
            if name == "claude":
                return fn(system_prompt, user_prompt, max_tokens=max_tokens, temperature=temperature,
                           enable_web_search=enable_web_search, timeout=timeout)
            return fn(system_prompt, user_prompt, max_tokens=max_tokens, temperature=temperature)
        except Exception as exc:  # noqa: BLE001
            logger.warning("AI provider '%s' failed: %s", name, exc)
            last_error = exc

    if last_error:
        raise AIProviderError(f"All configured AI providers failed: {last_error}")
    raise AIProviderError(
        "No AI provider is configured. Set CLAUDE_API_KEY, OPENAI_API_KEY, "
        "or GEMINI_API_KEY as an environment variable."
    )


def _local_project_description(title: str, target_role: str = "", skills=None) -> dict:
    """
    Offline fallback used only when no AI provider key is configured (or all
    configured providers fail). Builds a plausible, resume-ready project
    description from the title/role/skills alone, so the builder still
    produces something useful instead of erroring out.
    """
    skills = skills or []
    tech = [s for s in skills if s][:5] or ["Python", "REST APIs", "Git"]
    focus = target_role or "the target role"
    description = (
        f"Built \"{title}\" end-to-end, applying {', '.join(tech[:3])} to solve a "
        f"real-world problem relevant to {focus}."
    )
    bullets = [
        f"Designed and implemented \"{title}\" using {tech[0]}, structuring the "
        f"codebase for readability and future extension.",
        f"Integrated {', '.join(tech[1:3]) if len(tech) > 1 else 'supporting libraries'} "
        f"to handle core functionality, improving reliability and performance.",
        f"Documented setup and usage, making the project easy for recruiters and "
        f"collaborators to evaluate.",
    ]
    return {"description": description, "bullets": bullets, "tech": tech}


def _local_summary(name: str, target_role: str = "", skills=None, education=None, experience=None, projects=None) -> str:
    """
    Offline fallback used only when no AI provider key is configured (or all
    configured providers fail). Mirrors _local_project_description so the
    Professional Summary step still produces something useful instead of
    erroring out.
    """
    skills = skills or []
    education = education or []
    experience = experience or []
    projects = projects or []
    role = target_role or "their target role"
    top_skills = ", ".join([s for s in skills if s][:4]) or "a strong technical foundation"

    if experience:
        latest = experience[0]
        role_title = (latest.get("role") or "professional").strip()
        return (
            f"{role_title} with hands-on experience and skills in {top_skills}, "
            f"seeking to bring proven results to {role}. Known for combining "
            f"practical problem-solving with a strong grasp of {top_skills.split(',')[0] if top_skills else 'core tools'}."
        )

    if projects:
        proj_title = (projects[0].get("title") or "").strip()
        proj_part = f" through hands-on projects like \"{proj_title}\"" if proj_title else " through hands-on academic projects"
        return (
            f"Motivated fresher skilled in {top_skills}, with practical exposure gained{proj_part}. "
            f"Eager to apply a solid foundation and problem-solving mindset to {role}."
        )

    edu_part = ""
    if education:
        deg = (education[0].get("degree") or "").strip()
        if deg:
            edu_part = f" with a background in {deg}"

    return (
        f"Detail-oriented fresher{edu_part}, skilled in {top_skills}. "
        f"Quick to learn and eager to contribute to {role} with a strong work ethic and problem-solving ability."
    )


def _local_cover_letter(resume_text: str, target_role: str = "", company_name: str = "") -> str:
    """Offline fallback for the cover letter generator (same rationale as _local_summary)."""
    role = target_role or "this role"
    company = company_name or "your company"
    return (
        f"Dear Hiring Manager,\n\n"
        f"I am writing to express my interest in {role} at {company}. Based on my background, "
        f"I believe I can contribute meaningfully to your team from day one.\n\n"
        f"Throughout my education and hands-on projects, I have built practical skills and a "
        f"strong problem-solving mindset, which I am eager to bring to {company}. I take pride "
        f"in learning quickly, collaborating effectively, and delivering reliable results.\n\n"
        f"I would welcome the opportunity to discuss how my background aligns with your needs. "
        f"Thank you for considering my application.\n\n"
        f"Sincerely,\n"
        f"[Your Name]"
    )


def _local_linkedin_summary(resume_text: str, target_role: str = "") -> str:
    """Offline fallback for the LinkedIn 'About' summary generator."""
    role = target_role or "opportunities in my field"
    snippet = " ".join((resume_text or "").split())[:220]
    return (
        f"I'm passionate about {role} and always looking to grow my skills through hands-on "
        f"work and continuous learning. {(snippet + '...') if snippet else ''}\n\n"
        f"I enjoy tackling real problems, collaborating with others, and turning ideas into "
        f"working solutions. Always open to connecting — feel free to reach out if you'd like "
        f"to talk about {role} or potential opportunities."
    ).strip()


def _local_company_resume(resume_text: str, target_role: str, company: str) -> dict:
    """Offline fallback for company-specific resume tailoring, built from the
    candidate's own resume text rather than the AI provider."""
    role = target_role or "this role"
    lines = [ln.strip("•-* \t") for ln in (resume_text or "").split("\n") if ln.strip()]
    bullets = [ln for ln in lines if len(ln) > 25][:4] or ["Add more detail to your resume for tailored bullet suggestions."]
    return {
        "summary": (
            f"Candidate for {role} at {company}, bringing relevant skills and hands-on "
            f"experience drawn directly from the resume below. Motivated to contribute to "
            f"{company}'s team from day one."
        ),
        "bullets": bullets,
        "keywords": [],
    }


def extract_json(text: str):
    """Best-effort extraction of a JSON object from a model's text reply."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in AI response")
    return json.loads(text[start:end + 1])


# ─────────────────────────────────────────────────────────────
# API routes
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# Resume analysis: prompt engineering + schema normalization
# ─────────────────────────────────────────────────────────────

# This schema mirrors exactly what the existing frontend (app.js → renderAll)
# already expects, so no frontend code needs to change. A few extra fields
# requested for completeness (salary range, interview prep, 30/60/90 plan,
# etc.) are appended at the top level; the frontend simply ignores keys it
# doesn't render.
ANALYZE_SYSTEM_PROMPT = """You are simultaneously an experienced ATS (Applicant Tracking System) \
recruiter, a senior technical hiring manager, and a career coach with 15+ years across software, \
data, and product roles. You are reviewing ONE real candidate's resume text.

YOUR MOST IMPORTANT RULE: every single output must be derived strictly from what is actually \
written in the resume text you are given. Two different resumes must NEVER receive the same \
output. If you find yourself writing something generic enough to apply to any resume ("improve \
communication skills", "learn Python", "add more projects", "improve formatting") — STOP. That is \
a signal you have not looked closely enough at the actual content. Re-read the resume and produce \
something that could only be true for THIS candidate.

STRICT RULES:
1. Never hallucinate facts, companies, numbers, or skills that are not present or reasonably \
   inferable from the resume text.
2. Never use generic, templated, or boilerplate phrasing that could apply to any resume.
3. Never repeat the same recommendation in two different sections.
4. Base every recommendation strictly on the extracted content of THIS resume.
5. If a skill/technology is already present on the resume, NEVER recommend "learning" it again — \
   only recommend skills that are genuinely missing.
6. Only recommend missing technologies that logically complement the candidate's current stack \
   and target role (e.g. someone with Python + SQL + Power BI should be pointed toward Tableau, \
   statistics, and dashboarding — not toward Java or DevOps, which don't fit their profile).
7. Vary tone, wording and structure across resumes — do not fall into a fixed template.
8. Respond with ONLY one raw JSON object. No markdown code fences, no commentary before or after.

STEP 1 — EXTRACT (use these to inform every later field, don't just repeat them back):
Candidate Name, Education, CGPA, Degree, College, Skills, Programming Languages, Frameworks, \
Databases, Projects, Certifications, Internships, Experience, Achievements, Soft Skills, Missing \
Skills (relative to the candidate's own apparent target field), Target Role (best inferred role).

STEP 2 — SCORE the ATS compatibility (0-100) using this rubric, adjusted by judgment based on \
actual content quality (do not just add fixed points mechanically — reward genuinely strong, \
specific, well-quantified resumes and penalize vague, sparse ones):
- Contact info present (email/phone): up to 10
- Clear skills section with relevant, specific technologies: up to 20
- Quantified achievements (numbers, %, metrics): up to 15
- Relevant, well-described projects: up to 15
- Professional summary/objective: up to 10
- Certifications relevant to target role: up to 10
- Structure/formatting signals (bullets, links, consistent sections): up to 10
- Overall keyword alignment with the candidate's apparent target role: up to 10

STEP 3 — GENERATE personalized output. Respond with EXACTLY this JSON shape (fill every field; \
use empty arrays/strings only where the resume truly gives you nothing to work with — never fill \
with placeholder text):

{
  "parsed": {
    "name": "", "email": "", "phone": "", "cgpa": "(B.Tech CGPA only)", "github": "", "linkedin": "", "degree": "", "college": "",
    "target_role": "",
    "skills": [], "programming_languages": [], "frameworks": [], "databases": [],
    "internships": [], "achievements": [], "soft_skills": [],
    "education": [{"degree": "", "institution": "", "year": ""}],
    "experience": [{"title": "", "company": "", "duration": "", "description": ""}],
    "projects": [{"name": "", "description": "", "tech": []}],
    "certifications": []
  },
  "ats": {
    "score": 0, "grade": "A+|A|B+|B|C+|C",
    "suggestions": ["4 suggestions specific to THIS resume's actual gaps"],
    "compatibility_report": "2-3 sentences citing this resume's real content, score, and reasoning",
    "detailed": {
      "keyword_match": {"score": 0, "reason": "cite real keywords this resume has/lacks"},
      "grammar": {"score": 0, "reason": "specific grammar issues found, or why it's clean"},
      "readability": {"score": 0, "reason": "sentence length/clarity assessment of THIS resume"},
      "formatting": {"score": 0, "reason": "structure/section/consistency assessment"},
      "action_verbs": {"score": 0, "reason": "cites actual weak or strong verbs found in bullets"},
      "recruiter_readability": {"score": 0, "reason": "how quickly a recruiter could scan this in 6 seconds"},
      "industry_match": {"score": 0, "reason": "alignment with the candidate's apparent target industry"}
    },
    "missing": {
      "keywords": ["real keywords this resume lacks for its target role"],
      "weak_sections": ["section names that are thin or poorly written"],
      "weak_projects": ["project names/titles that lack detail or metrics, if any"],
      "skills": ["skills missing relative to target role"],
      "certifications": ["certifications this resume could use"],
      "has_internship": true,
      "has_github": true,
      "has_linkedin": true
    }
  },
  "strength": {
    "score": 0,
    "sections": {"summary": 0, "experience": 0, "skills": 0, "education": 0, "projects": 0, "certifications": 0}
  },
  "skills": {"technical": [], "soft": [], "tools": [], "frameworks": []},
  "skill_gap": {
    "missing": ["skills that genuinely complement this candidate's existing stack/target role"],
    "priority": ["top 3 of the above, ranked"],
    "industry_comparison": "1-2 sentences comparing this candidate's real skill set to their target role's typical requirements"
  },
  "problems": [
    {"icon": "emoji", "title": "specific problem found in THIS resume", "impact": "why it matters", "solution": "concrete fix"}
  ],
  "suggestions": [
    {"type": "Professional Summary", "original": "what this resume currently has (or '[missing]')", "improved": "a rewritten version using this candidate's real skills/experience"},
    {"type": "Experience Bullet — Before/After", "original": "an actual or representative weak bullet from this resume", "improved": "quantified rewrite using this candidate's real stack"},
    {"type": "Skills Section Format", "original": "this resume's current skills listing", "improved": "a better-organized version grouped by category using this candidate's REAL skills"}
  ],
  "job_roles": [
    {"title": "role name", "icon": "emoji", "confidence": 0, "description": "which of this candidate's actual skills match"}
  ],
  "career_guidance": {
    "recommendations": ["specific next steps derived from this exact resume's gaps and strengths"],
    "industries": ["industries that fit this candidate's actual stack"],
    "growth_opportunities": ["realistic next-role progression for this candidate"]
  },
  "roadmap": [
    {"period": "Month 1-2", "title": "", "items": ["specific to this candidate's real gaps"]},
    {"period": "Month 3-4", "title": "", "items": []},
    {"period": "Month 5-6", "title": "", "items": []},
    {"period": "Month 7-12", "title": "", "items": []}
  ],
  "resources": [
    {"icon": "emoji", "skill": "a skill this candidate is actually missing", "desc": "", "links": [{"name": "", "url": ""}]}
  ],
  "youtube": [
    {"skill": "video title relevant to a real gap", "channel": "", "url": "https://www.youtube.com/...", "thumb": "emoji", "duration": ""}
  ],
  "projects": {
    "beginner": [{"title": "", "desc": "", "skills": []}],
    "intermediate": [{"title": "", "desc": "", "skills": []}],
    "advanced": [{"title": "", "desc": "", "skills": []}]
  },
  "certifications": [
    {"icon": "emoji", "name": "cert relevant to this candidate's gaps/target role", "provider": "", "cost": "", "duration": ""}
  ],
  "portfolio": {"name": "", "title": "target role", "summary": "2-3 sentences using this candidate's real stack and experience", "email": "", "github": "", "linkedin": ""},

  "resume_summary": "3-4 sentence recruiter-style summary of THIS candidate",
  "technical_skills_analysis": "assessment of depth/breadth of this candidate's real technical skills",
  "soft_skills_analysis": "assessment based on any soft-skill evidence actually found in the resume",
  "industry_readiness_score": 0,
  "interview_prep": ["topics to prepare, specific to this candidate's target role and stack"],
  "salary_range": {"role": "", "range": "", "currency": "USD", "note": "basis for the estimate"},
  "career_plan_30_60_90": {"day_30": [], "day_60": [], "day_90": []}
}

All array fields with example lengths above are minimums — provide 3-5 items where the schema \
shows a list, except "problems" (2-5) and "job_roles" (6-8, drawn from a wide range of roles such as SDE, Python/Java Developer, Data Analyst, Data Engineer, ML/NLP/CV/GenAI Engineer, DevOps/SRE, QA, Mobile, UI/UX, Security, not only the obvious ones). Every string must be specific to this \
resume. Output ONLY the JSON object."""


def _clamp_score(value, default=50):
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return max(0, min(100, n))


def normalize_analysis(result: dict) -> dict:
    """
    Defensively fills in any top-level keys the model might have omitted so
    the existing frontend (which already reads most fields defensively with
    `?.` / `|| []`) never breaks, without altering the AI-generated content
    that IS present.
    """
    if not isinstance(result, dict):
        result = {}

    defaults = {
        "parsed": {}, "ats": {}, "strength": {}, "skills": {}, "skill_gap": {},
        "problems": [], "suggestions": [], "job_roles": [], "career_guidance": {},
        "roadmap": [], "resources": [], "youtube": [],
        "projects": {"beginner": [], "intermediate": [], "advanced": []},
        "certifications": [], "portfolio": {},
    }
    for key, default in defaults.items():
        result.setdefault(key, default)

    if isinstance(result.get("ats"), dict):
        result["ats"]["score"] = _clamp_score(result["ats"].get("score"))
        detailed = result["ats"].get("detailed")
        if isinstance(detailed, dict):
            for key, val in detailed.items():
                if isinstance(val, dict):
                    val["score"] = _clamp_score(val.get("score"))
        else:
            result["ats"]["detailed"] = {}
        if not isinstance(result["ats"].get("missing"), dict):
            result["ats"]["missing"] = {}
    if isinstance(result.get("strength"), dict):
        result["strength"]["score"] = _clamp_score(result["strength"].get("score"))

    return result


# ─────────────────────────────────────────────────────────────
# API routes
# ─────────────────────────────────────────────────────────────

@app.route("/api/analyze-resume", methods=["POST"])
def analyze_resume():
    body = request.get_json(silent=True) or {}
    resume_text = (body.get("text") or "").strip()

    if not resume_text:
        return jsonify({"error": "Field 'text' (resume content) is required."}), 400

    # Guard against runaway token usage on huge uploads while keeping
    # enough content for genuinely personalized extraction.
    truncated_text = resume_text[:14000]

    user_prompt = (
        "Analyze this resume and return the JSON object described in your "
        "instructions. Resume text follows, verbatim, between the markers:\n"
        "-----RESUME START-----\n"
        f"{truncated_text}\n"
        "-----RESUME END-----"
    )

    def _run_analysis(extra_note: str = "") -> dict:
        prompt = user_prompt if not extra_note else f"{user_prompt}\n\n{extra_note}"
        raw = call_ai(ANALYZE_SYSTEM_PROMPT, prompt, max_tokens=4096, temperature=0.55)
        return extract_json(raw)

    try:
        try:
            result = _run_analysis()
        except (ValueError, json.JSONDecodeError):
            # One repair attempt: ask the model to strictly re-emit valid JSON.
            result = _run_analysis(
                "Your previous response was not valid JSON. Respond again with "
                "ONLY the raw JSON object, no markdown fences, no commentary."
            )
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("analyze-resume failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(normalize_analysis(result)), 200


@app.route("/api/chat", methods=["POST"])
def chat():
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    history = body.get("history") or []

    if not message:
        return jsonify({"error": "Field 'message' is required."}), 400

    system_prompt = (
        "You are ResumeAI's helpful career assistant. Answer clearly and "
        "concisely, focused on resumes, job search, and career growth."
    )

    convo_lines = []
    for turn in history[-10:]:
        role = "User" if turn.get("role") == "user" else "Assistant"
        convo_lines.append(f"{role}: {turn.get('content', '')}")
    convo_lines.append(f"User: {message}")
    user_prompt = "\n".join(convo_lines)

    try:
        reply = call_ai(system_prompt, user_prompt)
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:  # noqa: BLE001
        logger.exception("chat failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify({"reply": reply}), 200


@app.route("/api/generate-roadmap", methods=["POST"])
def generate_roadmap():
    body = request.get_json(silent=True) or {}
    current_skills = body.get("currentSkills") or []
    target_role = (body.get("targetRole") or "").strip()

    if not target_role:
        return jsonify({"error": "Field 'targetRole' is required."}), 400

    system_prompt = (
        "You are a career roadmap planning assistant. Respond with ONLY a "
        "valid JSON object (no markdown, no commentary) with fields: "
        "stages (array of objects each with 'title', 'duration', "
        "'skillsToLearn' array, and 'milestones' array), certifications "
        "(array of strings), estimatedTimelineMonths (integer)."
    )
    user_prompt = (
        f"Target role: {target_role}\n"
        f"Current skills: {', '.join(current_skills) if current_skills else 'none listed'}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt)
        result = extract_json(raw)
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("generate-roadmap failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(result), 200


@app.route("/api/project-suggestions", methods=["POST"])
def project_suggestions():
    body = request.get_json(silent=True) or {}
    skills = body.get("skills") or []
    role = (body.get("targetRole") or "").strip()

    if not skills and not role:
        return jsonify({"error": "Provide 'skills' and/or 'targetRole'."}), 400

    system_prompt = (
        "You are a project-idea generator for job seekers building a "
        "portfolio. Respond with ONLY a valid JSON object (no markdown, no "
        "commentary) with field 'projects': an array of objects each with "
        "'title', 'description', and 'skills' (array of strings). Suggest "
        "3-5 projects."
    )
    user_prompt = (
        f"Target role: {role or 'not specified'}\n"
        f"Known skills: {', '.join(skills) if skills else 'not specified'}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt)
        result = extract_json(raw)
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("project-suggestions failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(result), 200


# ─────────────────────────────────────────────────────────────
# AI Resume Builder — NEW, additive endpoints only.
# ─────────────────────────────────────────────────────────────
# These power the new "Resume Builder" page (resume-builder.html /
# resume-builder.js). They are completely separate from the
# analyze-resume pipeline above and do not alter it in any way — the
# builder simply produces a plain-text resume that it then feeds into
# the existing /api/analyze-resume endpoint / fetchAIAnalysis() /
# renderAll() pipeline on the dashboard, exactly like an uploaded file.

def _fmt_list(items):
    items = [str(i).strip() for i in (items or []) if str(i).strip()]
    return ", ".join(items) if items else "none provided"


@app.route("/api/builder/generate-summary", methods=["POST"])
def builder_generate_summary():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    target_role = (body.get("targetRole") or "").strip()
    skills = body.get("skills") or []
    education = body.get("education") or []
    experience = body.get("experience") or []
    projects = body.get("projects") or []

    system_prompt = (
        "You are an expert resume writer. Write ONE professional resume summary "
        "of 2-3 sentences (40-60 words), first-person-implied (no 'I'), ATS-friendly, "
        "specific to the candidate's real background below — never generic filler. "
        "If the candidate has no listed experience, write a confident fresher/entry-level "
        "summary that leans on education, skills, and projects instead. "
        "Respond with ONLY a valid JSON object: {\"summary\": \"...\"}. No markdown, no commentary."
    )
    user_prompt = (
        f"Name: {name or 'Candidate'}\n"
        f"Target role: {target_role or 'not specified'}\n"
        f"Skills: {_fmt_list(skills)}\n"
        f"Education: {_fmt_list([e.get('degree', '') + ' - ' + e.get('institution', '') for e in education])}\n"
        f"Experience: {_fmt_list([e.get('role', '') + ' at ' + e.get('company', '') for e in experience])}\n"
        f"Projects: {_fmt_list([p.get('title', '') for p in projects])}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=400, temperature=0.6)
        result = extract_json(raw)
        summary = (result or {}).get("summary", "").strip()
        if not summary:
            raise ValueError("empty summary from AI")
    except AIProviderError as exc:
        logger.warning("generate-summary: no AI provider available, using offline fallback: %s", exc)
        summary = _local_summary(name, target_role, skills, education, experience, projects)
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("generate-summary: AI response unusable, using offline fallback: %s", exc)
        summary = _local_summary(name, target_role, skills, education, experience, projects)
    except Exception as exc:  # noqa: BLE001
        logger.exception("builder generate-summary failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify({"summary": summary}), 200


# Small built-in fallback so "Recommend skills for my target role" always
# suggests something useful even if every AI provider call fails (e.g. no
# API key configured, provider outage, rate limit) — mirrors the pattern
# already used for /api/trending-technologies above. Matched against the
# target role by keyword; falls back to a general software-role list.
SKILLS_FALLBACK_BY_ROLE = [
    (("frontend", "front-end", "front end", "react", "ui developer"),
     ["JavaScript", "React", "HTML5", "CSS3", "TypeScript", "Redux", "REST APIs", "Git", "Responsive Design", "Webpack"]),
    (("backend", "back-end", "back end", "node", "api developer"),
     ["Node.js", "Python", "REST APIs", "SQL", "MongoDB", "Docker", "Git", "System Design", "Authentication (JWT)", "Unit Testing"]),
    (("full stack", "fullstack", "full-stack"),
     ["JavaScript", "React", "Node.js", "SQL", "MongoDB", "REST APIs", "Git", "Docker", "HTML5", "CSS3"]),
    (("data scien", "machine learning", "ml engineer", "ai engineer", "artificial intelligence"),
     ["Python", "Pandas", "NumPy", "Scikit-learn", "TensorFlow", "PyTorch", "SQL", "Data Visualization", "Statistics", "Git"]),
    (("devops", "site reliability", "sre", "platform engineer"),
     ["Docker", "Kubernetes", "CI/CD", "AWS", "Terraform", "Linux", "Git", "Bash Scripting", "Monitoring (Prometheus/Grafana)", "Networking Basics"]),
    (("android", "ios", "mobile"),
     ["Kotlin", "Swift", "Flutter", "React Native", "REST APIs", "Git", "Firebase", "UI/UX Basics", "SQLite", "Agile"]),
    (("qa", "test", "sdet"),
     ["Manual Testing", "Selenium", "Test Case Design", "API Testing (Postman)", "Bug Tracking (Jira)", "SQL", "Automation Scripting", "Git", "Agile", "Regression Testing"]),
    (("cyber", "security"),
     ["Network Security", "OWASP Top 10", "Linux", "Python", "Penetration Testing Basics", "Cryptography Basics", "SIEM Tools", "Git", "Cloud Security Basics", "Risk Assessment"]),
    (("ui", "ux", "product design"),
     ["Figma", "Wireframing", "User Research", "Prototyping", "Design Systems", "Adobe XD", "Usability Testing", "Responsive Design", "Accessibility Basics", "Git"]),
    (("data analy",),
     ["SQL", "Excel", "Python", "Power BI", "Tableau", "Data Cleaning", "Statistics", "Data Visualization", "Pandas", "Git"]),
]
SKILLS_FALLBACK_DEFAULT = ["Python", "SQL", "Git", "REST APIs", "Problem Solving", "Data Structures & Algorithms",
                            "Object-Oriented Programming", "Agile/Scrum", "Cloud Basics (AWS/Azure)", "Communication"]


def _skills_fallback(target_role: str, existing: list) -> list:
    role = (target_role or "").lower()
    picked = SKILLS_FALLBACK_DEFAULT
    for keywords, skills in SKILLS_FALLBACK_BY_ROLE:
        if any(kw in role for kw in keywords):
            picked = skills
            break
    existing_lower = {str(s).strip().lower() for s in (existing or [])}
    return [s for s in picked if s.lower() not in existing_lower]


@app.route("/api/builder/recommend-skills", methods=["POST"])
def builder_recommend_skills():
    body = request.get_json(silent=True) or {}
    target_role = (body.get("targetRole") or "").strip()
    existing = body.get("existingSkills") or []

    if not target_role:
        return jsonify({"error": "Field 'targetRole' is required."}), 400

    system_prompt = (
        "You are a technical recruiter. Recommend 8-12 in-demand, realistic skills "
        "(mix of technical + tools, and 1-2 soft skills) for the given target job role, "
        "excluding any skills the candidate already listed. Respond with ONLY a valid "
        "JSON object: {\"skills\": [\"...\"]}. No markdown, no commentary."
    )
    user_prompt = f"Target role: {target_role}\nAlready has: {_fmt_list(existing)}"

    skills = None
    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=500, temperature=0.5)
        result = extract_json(raw)
        skills = (result or {}).get("skills") or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("builder recommend-skills: AI call failed, using fallback list: %s", exc)

    if not skills:
        # AI provider unavailable/unconfigured or returned nothing usable —
        # never leave the user with just an error, offer a sensible fallback.
        skills = _skills_fallback(target_role, existing)

    return jsonify({"skills": skills}), 200


@app.route("/api/builder/generate-project-description", methods=["POST"])
def builder_generate_project_description():
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "").strip()
    target_role = (body.get("targetRole") or "").strip()
    skills = body.get("skills") or []

    if not title:
        return jsonify({"error": "Field 'title' is required."}), 400

    system_prompt = (
        "You are a resume writer. Given only a project title (and optionally the "
        "candidate's target role/skills), invent a plausible, specific, professional "
        "project description an entry-to-mid level candidate could credibly have built. "
        "Respond with ONLY a valid JSON object: {\"description\": \"1-2 sentence overview\", "
        "\"bullets\": [\"2-3 ATS-friendly resume bullet points, action-verb led, with a "
        "believable quantified detail where natural\"], \"tech\": [\"3-6 relevant "
        "technologies/tools\"]}. No markdown, no commentary."
    )
    user_prompt = (
        f"Project title: {title}\n"
        f"Candidate target role: {target_role or 'not specified'}\n"
        f"Candidate's known skills: {_fmt_list(skills)}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=500, temperature=0.6)
        result = extract_json(raw)
    except AIProviderError as exc:
        # No provider configured (or all failed) — degrade gracefully with a
        # locally-built description instead of failing the request.
        logger.warning("generate-project-description: %s — using local fallback", exc)
        result = _local_project_description(title, target_role, skills)
    except (ValueError, json.JSONDecodeError):
        logger.warning("generate-project-description: AI response not valid JSON — using local fallback")
        result = _local_project_description(title, target_role, skills)
    except Exception as exc:  # noqa: BLE001
        logger.exception("builder generate-project-description failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(result or {}), 200


@app.route("/api/builder/generate-experience-bullets", methods=["POST"])
def builder_generate_experience_bullets():
    body = request.get_json(silent=True) or {}
    company = (body.get("company") or "").strip()
    role = (body.get("role") or "").strip()
    duration = (body.get("duration") or "").strip()
    target_role = (body.get("targetRole") or "").strip()

    if not company or not role:
        return jsonify({"error": "Fields 'company' and 'role' are required."}), 400

    system_prompt = (
        "You are a resume writer specializing in ATS-friendly, quantified bullet points. "
        "Given only a job title and company (no further detail), write 3-4 realistic, "
        "specific resume bullet points for that role — action-verb led, each with a "
        "believable metric/scope where natural, relevant to the candidate's target role "
        "if given. Respond with ONLY a valid JSON object: {\"bullets\": [\"...\"]}. "
        "No markdown, no commentary."
    )
    user_prompt = (
        f"Job title: {role}\nCompany: {company}\nDuration: {duration or 'not specified'}\n"
        f"Candidate target role: {target_role or 'same as this job title'}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=450, temperature=0.6)
        result = extract_json(raw)
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("builder generate-experience-bullets failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify({"bullets": (result or {}).get("bullets", [])}), 200


@app.route("/api/builder/finalize-resume", methods=["POST"])
def builder_finalize_resume():
    """
    Takes the full builder form (whatever the user filled in, possibly with
    gaps) and returns a completed version: any field the AI-assist steps
    were skipped for is filled in server-side too, plus a clean ATS-friendly
    plain-text rendering of the whole resume (`resume_text`) that the
    frontend feeds directly into the EXISTING /api/analyze-resume pipeline.
    """
    body = request.get_json(silent=True) or {}
    personal = body.get("personal") or {}
    target_role = (body.get("targetRole") or "").strip()
    summary = (body.get("summary") or "").strip()
    education = body.get("education") or []
    skills = body.get("skills") or []
    projects = body.get("projects") or []
    experience = body.get("experience") or []
    certifications = body.get("certifications") or []
    achievements = body.get("achievements") or []
    languages = body.get("languages") or []
    interests = body.get("interests") or []
    is_fresher = len(experience) == 0

    system_prompt = (
        "You are an expert ATS resume writer completing a resume builder form for a "
        "candidate. Some fields may already be filled in by the candidate — NEVER change "
        "or discard those, only fill in what is genuinely missing or clearly incomplete "
        "(e.g. a project with only a title, an experience entry with no bullet points, "
        "a missing summary, an empty skills list). "
        + ("The candidate has NO work experience — write this as a strong, confident "
           "fresher/entry-level resume that leans on education, projects, and skills. "
           if is_fresher else
           "The candidate has listed real work experience — keep/polish it and make sure "
           "every experience entry has 3-4 ATS-friendly, action-verb, quantified bullet points. ") +
        "Respond with ONLY one valid JSON object matching EXACTLY this shape (no markdown, "
        "no commentary):\n"
        "{\n"
        '  "summary": "2-3 sentence professional summary",\n'
        '  "skills": ["..."],\n'
        '  "projects": [{"title": "", "description": "", "bullets": ["..."], "tech": ["..."]}],\n'
        '  "experience": [{"company": "", "role": "", "duration": "", "bullets": ["..."]}],\n'
        '  "resume_text": "the ENTIRE resume rendered as clean ATS-friendly plain text, '
        "with clear section headers (SUMMARY, SKILLS, EDUCATION, PROJECTS, EXPERIENCE, "
        "CERTIFICATIONS, ACHIEVEMENTS, LANGUAGES, INTERESTS -- omit any section that is "
        "truly empty), using the candidate's real name/contact info at the top\"\n"
        "}"
    )
    user_prompt = (
        f"Personal info: {json.dumps(personal)}\n"
        f"Target role: {target_role or 'not specified'}\n"
        f"Existing summary (may be empty): {summary or '[empty — please generate]'}\n"
        f"Education: {json.dumps(education)}\n"
        f"Skills (may be empty): {json.dumps(skills)}\n"
        f"Projects: {json.dumps(projects)}\n"
        f"Experience (may be empty = fresher): {json.dumps(experience)}\n"
        f"Certifications: {json.dumps(certifications)}\n"
        f"Achievements: {json.dumps(achievements)}\n"
        f"Languages: {json.dumps(languages)}\n"
        f"Interests: {json.dumps(interests)}"
    )

    def _run(extra_note: str = "") -> dict:
        prompt = user_prompt if not extra_note else f"{user_prompt}\n\n{extra_note}"
        raw = call_ai(system_prompt, prompt, max_tokens=3000, temperature=0.55)
        return extract_json(raw)

    try:
        try:
            result = _run()
        except (ValueError, json.JSONDecodeError):
            result = _run(
                "Your previous response was not valid JSON. Respond again with ONLY "
                "the raw JSON object, no markdown fences, no commentary."
            )
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("builder finalize-resume failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    if not isinstance(result, dict):
        result = {}
    result.setdefault("summary", summary)
    result.setdefault("skills", skills)
    result.setdefault("projects", projects)
    result.setdefault("experience", experience)
    result.setdefault("resume_text", "")

    return jsonify(result), 200


@app.route("/api/builder/generate-cover-letter", methods=["POST"])
def builder_generate_cover_letter():
    body = request.get_json(silent=True) or {}
    resume_text = (body.get("resumeText") or "").strip()
    target_role = (body.get("targetRole") or "").strip()
    company_name = (body.get("companyName") or "").strip()

    if not resume_text:
        return jsonify({"error": "Field 'resumeText' is required."}), 400

    system_prompt = (
        "You are a professional cover letter writer. Write a concise, compelling "
        "3-4 paragraph cover letter based strictly on the real resume content given, "
        "tailored to the target role/company if provided. No placeholders like '[Company "
        "Name]' unless truly no company was given, in which case use 'your company'. "
        "Respond with ONLY a valid JSON object: {\"cover_letter\": \"...\"}. No markdown fences."
    )
    user_prompt = (
        f"Target role: {target_role or 'not specified'}\n"
        f"Company: {company_name or 'not specified'}\n"
        f"Resume:\n{resume_text[:6000]}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=900, temperature=0.6)
        result = extract_json(raw)
        cover_letter = (result or {}).get("cover_letter", "").strip()
        if not cover_letter:
            raise ValueError("empty cover letter from AI")
    except AIProviderError as exc:
        logger.warning("generate-cover-letter: no AI provider available, using offline fallback: %s", exc)
        cover_letter = _local_cover_letter(resume_text, target_role, company_name)
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("generate-cover-letter: AI response unusable, using offline fallback: %s", exc)
        cover_letter = _local_cover_letter(resume_text, target_role, company_name)
    except Exception as exc:  # noqa: BLE001
        logger.exception("builder generate-cover-letter failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify({"cover_letter": cover_letter}), 200


@app.route("/api/builder/generate-linkedin-summary", methods=["POST"])
def builder_generate_linkedin_summary():
    body = request.get_json(silent=True) or {}
    resume_text = (body.get("resumeText") or "").strip()
    target_role = (body.get("targetRole") or "").strip()

    if not resume_text:
        return jsonify({"error": "Field 'resumeText' is required."}), 400

    system_prompt = (
        "You are a LinkedIn branding expert. Write an engaging, first-person LinkedIn "
        "'About' summary (120-180 words) based strictly on the real resume content given. "
        "Confident, human tone, not corporate/robotic. Respond with ONLY a valid JSON "
        "object: {\"linkedin_summary\": \"...\"}. No markdown fences."
    )
    user_prompt = f"Target role: {target_role or 'not specified'}\nResume:\n{resume_text[:6000]}"

    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=500, temperature=0.65)
        result = extract_json(raw)
        linkedin_summary = (result or {}).get("linkedin_summary", "").strip()
        if not linkedin_summary:
            raise ValueError("empty linkedin summary from AI")
    except AIProviderError as exc:
        logger.warning("generate-linkedin-summary: no AI provider available, using offline fallback: %s", exc)
        linkedin_summary = _local_linkedin_summary(resume_text, target_role)
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("generate-linkedin-summary: AI response unusable, using offline fallback: %s", exc)
        linkedin_summary = _local_linkedin_summary(resume_text, target_role)
    except Exception as exc:  # noqa: BLE001
        logger.exception("builder generate-linkedin-summary failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify({"linkedin_summary": linkedin_summary}), 200


@app.route("/api/builder/recommend-soft-skills", methods=["POST"])
def builder_recommend_soft_skills():
    """
    Deterministic (no AI call, no API key required) soft-skill suggestion —
    the master prompt asks for these to be "generated automatically based on
    profile", not authored per-candidate, so a reliable local mapping is a
    better fit than an LLM call that could fail or drift.
    """
    body = request.get_json(silent=True) or {}
    target_role = (body.get("targetRole") or "").lower()
    branch = (body.get("branch") or "").lower()
    achievements = body.get("achievements") or []

    base = ["Communication", "Problem Solving", "Adaptability", "Time Management"]
    role_map = {
        "lead": ["Leadership", "Team Management"],
        "manager": ["Leadership", "Team Management"],
        "engineer": ["Analytical Thinking", "Critical Thinking"],
        "data": ["Analytical Thinking", "Attention to Detail"],
        "design": ["Creativity", "Attention to Detail"],
        "support": ["Customer Focus", "Patience"],
        "sales": ["Negotiation", "Persuasion"],
    }
    branch_map = {
        "ai": ["Analytical Thinking", "Research Aptitude"],
        "data science": ["Analytical Thinking", "Data Storytelling"],
        "ece": ["Attention to Detail", "Troubleshooting"],
        "cse": ["Logical Reasoning", "Teamwork"],
    }

    suggestions = list(base)
    for key, skills in role_map.items():
        if key in target_role:
            suggestions.extend(skills)
    for key, skills in branch_map.items():
        if key in branch:
            suggestions.extend(skills)
    if achievements:
        suggestions.append("Leadership")
    suggestions.append("Teamwork")

    # de-duplicate, preserve order, cap at 8
    seen = set()
    out = []
    for s in suggestions:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return jsonify({"softSkills": out[:8]}), 200


@app.route("/api/builder/branch-keywords", methods=["GET"])
def builder_branch_keywords():
    """Branch-wise ATS keyword lists, straight from the master prompt spec."""
    branches = {
        "CSE": "Java, Python, C++, DSA, Algorithms, OOP, DBMS, SQL, Operating Systems, "
               "Computer Networks, Spring Boot, React, REST APIs, Git, GitHub, Linux, "
               "Cloud, Microservices, Agile",
        "CSE (AI & ML)": "Machine Learning, Deep Learning, TensorFlow, PyTorch, NLP, "
                          "Computer Vision, LLM, Generative AI, Prompt Engineering, "
                          "LangChain, RAG, MLOps, Pandas, NumPy, Scikit-learn",
        "CSE (Data Science)": "Python, SQL, Statistics, Data Analytics, Power BI, Tableau, "
                               "Excel, Pandas, NumPy, Predictive Analytics, Feature "
                               "Engineering, Data Visualization",
        "ECE": "Embedded Systems, Microcontrollers, ARM, Arduino, IoT, MATLAB, Verilog, "
               "FPGA, VLSI, Digital Electronics, Analog Electronics, Communication "
               "Systems, Signal Processing, Keil, Proteus",
        "Mechanical": "AutoCAD, SolidWorks, CATIA, ANSYS, CAD/CAM, Thermodynamics, Fluid "
                      "Mechanics, Machine Design, Manufacturing Processes, Robotics, CNC, "
                      "GD&T, Six Sigma, Product Design, MATLAB",
    }
    return jsonify({"branches": branches}), 200


@app.route("/api/builder/profile-score", methods=["POST"])
def builder_profile_score():
    """
    Heuristic (no external scraping — LinkedIn/GitHub don't allow unauthenticated
    server-side scraping of profile pages) completeness scoring for LinkedIn and
    GitHub, plus an overall professional-profile score. This checks URL presence/
    validity and cross-references resume content, which is the same signal a
    recruiter skimming a resume would use.
    """
    body = request.get_json(silent=True) or {}
    linkedin = (body.get("linkedin") or "").strip()
    github = (body.get("github") or "").strip()
    resume_text = (body.get("resumeText") or "").strip()

    recommendations = []

    linkedin_score = 0
    if linkedin:
        linkedin_score += 40
        if "linkedin.com/in/" in linkedin.lower():
            linkedin_score += 20
        else:
            recommendations.append("Your LinkedIn URL doesn't look like a standard linkedin.com/in/... profile link — double check it.")
        if len(resume_text) > 200:
            linkedin_score += 20
        if any(k in resume_text.lower() for k in ["project", "internship", "certification"]):
            linkedin_score += 20
    else:
        recommendations.append("Add a LinkedIn profile — recruiters check it for nearly every shortlisted candidate. Use a professional headline, a complete About section, and list your projects and certifications.")

    github_score = 0
    if github:
        github_score += 40
        if "github.com/" in github.lower():
            github_score += 20
        else:
            recommendations.append("Your GitHub URL doesn't look like a standard github.com/... profile link — double check it.")
        if "project" in resume_text.lower():
            github_score += 25
        if any(k in resume_text.lower() for k in ["python", "java", "react", "sql", "c++", "javascript"]):
            github_score += 15
    else:
        recommendations.append("Add a GitHub profile — pin your best 3-4 repositories, write clear READMEs, and keep commit activity visible.")

    linkedin_score = min(linkedin_score, 100)
    github_score = min(github_score, 100)
    overall_score = round((linkedin_score + github_score) / 2) if (linkedin or github) else 0

    if linkedin_score and linkedin_score < 80:
        recommendations.append("Flesh out your LinkedIn About section and add every project/certification you have on your resume.")
    if github_score and github_score < 80:
        recommendations.append("Pin your strongest repositories and make sure each has a README explaining what it does and how to run it.")
    if not recommendations:
        recommendations.append("Your profiles look solid — keep them updated as you add new projects and certifications.")

    return jsonify({
        "linkedinScore": linkedin_score,
        "githubScore": github_score,
        "overallScore": overall_score,
        "recommendations": recommendations,
    }), 200


@app.route("/api/builder/company-resume", methods=["POST"])
def builder_company_resume():
    body = request.get_json(silent=True) or {}
    resume_text = (body.get("resumeText") or "").strip()
    target_role = (body.get("targetRole") or "").strip()
    company = (body.get("company") or "").strip()

    if not resume_text or not company:
        return jsonify({"error": "Fields 'resumeText' and 'company' are required."}), 400

    system_prompt = (
        "You are a technical recruiter who screens resumes for the named company. "
        "Given a candidate's real resume, produce: (1) a 2-3 sentence summary "
        "tailored to what that specific company typically values in candidates for "
        "this role, (2) 3-4 existing resume bullet points rewritten/reordered to "
        "lead with what that company's recruiters screen for first, and (3) 6-10 "
        "ATS keywords this company's job postings commonly use that the candidate "
        "should echo. Use ONLY real content from the candidate's resume — never "
        "invent experience, skills, or achievements they don't have. Respond with "
        "ONLY a valid JSON object: {\"summary\": \"...\", \"bullets\": [\"...\"], "
        "\"keywords\": [\"...\"]}. No markdown, no commentary."
    )
    user_prompt = (
        f"Target company: {company}\n"
        f"Target role: {target_role or 'not specified'}\n"
        f"Resume:\n{resume_text[:6000]}"
    )

    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=700, temperature=0.5)
        result = extract_json(raw)
        if not (result or {}).get("summary"):
            raise ValueError("empty company-resume result from AI")
    except AIProviderError as exc:
        logger.warning("company-resume: no AI provider available, using offline fallback: %s", exc)
        result = _local_company_resume(resume_text, target_role, company)
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("company-resume: AI response unusable, using offline fallback: %s", exc)
        result = _local_company_resume(resume_text, target_role, company)
    except Exception as exc:  # noqa: BLE001
        logger.exception("builder company-resume failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(result or {}), 200


TRENDING_SYSTEM_PROMPT = (
    "You are a technology market analyst who tracks what skills and tools "
    "employers are actively hiring for right now. If you have a web_search "
    "tool available, USE IT — run a few searches (e.g. \"trending tech "
    "skills hiring {current year}\", \"in-demand programming languages "
    "{current year}\", \"latest AI tools job market\") before answering, so "
    "your list reflects real, current information rather than only your "
    "training data. Produce a snapshot of CURRENTLY trending and "
    "recently-updated/newly-released technologies in the job market. Favor "
    "genuinely current, specific items (named frameworks, platforms, "
    "model/tool versions, certifications) over vague buzzwords. If a target "
    "role is given, prioritize technologies relevant to that role; "
    "otherwise cover a healthy spread across software/AI, cloud & DevOps, "
    "and data. Never repeat a technology the candidate already lists as a "
    "skill. After any searching, respond with ONLY a valid JSON object of "
    "this shape (no markdown, no commentary, no text before or after the "
    "JSON): {\"as_of\": \"short label for how current this is, e.g. "
    "'September 2026 snapshot'\", \"trending\": [{\"name\": \"\", "
    "\"category\": \"AI/ML|Cloud|Frontend|Backend|Data|DevOps|Security|"
    "Mobile|Other\", \"status\": \"Hot|Rising|Emerging\", \"why\": \"one "
    "specific sentence on why it's in demand right now\"}], \"note\": "
    "\"1-2 sentence overview of where the market is heading\"}. Provide "
    "10-14 items in \"trending\"."
)

# Small built-in fallback so this feature always shows the user something
# useful even if every AI provider call fails (e.g. no API key configured,
# provider outage, rate limit). Not shown unless the AI calls below fail.
TRENDING_FALLBACK = {
    "as_of": "",
    "note": "",
    "trending": [
        {"name": "Generative AI / LLM tooling (RAG, agents, prompt engineering)", "category": "AI/ML", "status": "Hot", "why": "Employers across industries are hiring for AI-assisted product and workflow integration."},
        {"name": "Python", "category": "Backend", "status": "Hot", "why": "Remains the default language for AI/ML, data, and automation roles."},
        {"name": "TypeScript", "category": "Frontend", "status": "Hot", "why": "Standard for large-scale React/Next.js codebases in modern job postings."},
        {"name": "React / Next.js", "category": "Frontend", "status": "Hot", "why": "Most in-demand frontend framework combo in current listings."},
        {"name": "Kubernetes", "category": "DevOps", "status": "Rising", "why": "Container orchestration skills are consistently requested for platform/DevOps roles."},
        {"name": "Cloud platforms (AWS / Azure / GCP)", "category": "Cloud", "status": "Hot", "why": "Cloud certification and hands-on experience remain top screening criteria."},
        {"name": "SQL + modern data warehousing (Snowflake, BigQuery)", "category": "Data", "status": "Hot", "why": "Data roles increasingly expect warehouse-native SQL skills over spreadsheets."},
        {"name": "CI/CD & Infrastructure as Code (Terraform)", "category": "DevOps", "status": "Rising", "why": "Automated, reproducible deployments are now a baseline expectation."},
        {"name": "Cybersecurity fundamentals (Zero Trust, cloud security)", "category": "Security", "status": "Rising", "why": "Security-aware engineers are increasingly preferred even outside dedicated security roles."},
        {"name": "Vector databases & embeddings", "category": "AI/ML", "status": "Emerging", "why": "Needed to build retrieval-augmented AI features, a fast-growing product category."},
    ],
}


@app.route("/api/trending-technologies", methods=["POST"])
def trending_technologies():
    """
    New, additive feature: returns a snapshot of currently trending / newly
    updated job-market technologies, optionally focused on a target role and
    the candidate's existing skills. Used by BOTH the resume-upload/analysis
    screen and the resume builder — nothing else in this file is modified to
    add this.

    Tries, in order: (1) a Claude call WITH live web search grounding so the
    list reflects real current information, (2) a plain AI call without web
    search if that fails for any reason, (3) a small static fallback list so
    the user never just sees an error.
    """
    try:
        body = request.get_json(silent=True) or {}
        target_role = (body.get("targetRole") or "").strip()
        existing_skills = body.get("existingSkills") or []

        user_prompt = (
            f"Target role: {target_role or 'not specified — cover a general spread'}\n"
            f"Candidate already knows: {_fmt_list(existing_skills)}"
        )

        result = None
        try:
            # Kept under ~30s so this never outlives a typical host/proxy
            # request timeout — if the web-search-grounded call is going to
            # fail or hang, we want to know quickly and fall back, rather
            # than have the connection silently die and show the user
            # "could not reach the server".
            raw = call_ai(TRENDING_SYSTEM_PROMPT, user_prompt, max_tokens=1200, temperature=0.6,
                          enable_web_search=True, timeout=30)
            result = extract_json(raw)
        except Exception as exc:  # noqa: BLE001
            logger.warning("trending-technologies: web-search-grounded call failed, retrying without search: %s", exc)

        if not isinstance(result, dict) or not result.get("trending"):
            try:
                raw = call_ai(TRENDING_SYSTEM_PROMPT, user_prompt, max_tokens=1200, temperature=0.6, timeout=30)
                result = extract_json(raw)
            except Exception as exc:  # noqa: BLE001
                logger.warning("trending-technologies: fallback AI call also failed: %s", exc)
                result = None

        if not isinstance(result, dict) or not result.get("trending"):
            result = dict(TRENDING_FALLBACK)

        result.setdefault("trending", [])
        result.setdefault("note", "")
        result.setdefault("as_of", "")
        return jsonify(result), 200
    except Exception:
        # Belt-and-braces: whatever goes wrong (bad request body, unexpected
        # provider response shape, etc.), still return a real 200 with the
        # static fallback instead of a 500 — the frontend should never show
        # "could not reach the server" for a request that actually reached
        # and was handled by the server.
        logger.exception("trending-technologies: unexpected failure, serving static fallback")
        return jsonify(dict(TRENDING_FALLBACK)), 200


@app.route("/api/builder/quality-check", methods=["POST"])
def builder_quality_check():
    """
    Deterministic Resume Quality Checker — mirrors the "Resume Quality Checker"
    section of the master prompt (weak verbs, passive voice, repeated content,
    length, formatting red flags). Runs locally, no AI call needed, so it never
    fails even if no API key is configured.
    """
    body = request.get_json(silent=True) or {}
    text = (body.get("resumeText") or "").strip()
    if not text:
        return jsonify({"error": "Field 'resumeText' is required."}), 400

    issues = []
    lower = text.lower()
    word_count = len(text.split())

    weak_verbs = ["responsible for", "worked on", "helped with", "involved in", "assisted in", "duties included"]
    found_weak = [w for w in weak_verbs if w in lower]
    if found_weak:
        issues.append(f"Weak/passive phrasing found ({', '.join(found_weak)}) — replace with strong action verbs like 'Built', 'Led', 'Optimized', 'Designed'.")

    passive_markers = [" was ", " were ", " been ", " being "]
    passive_hits = sum(lower.count(m) for m in passive_markers)
    if passive_hits >= 3:
        issues.append("Frequent passive-voice constructions detected — rewrite sentences in active voice (e.g. 'Built the API' instead of 'The API was built by me').")

    lines = [l for l in text.split("\n") if l.strip()]
    long_paragraphs = [l for l in lines if len(l) > 400]
    if long_paragraphs:
        issues.append("One or more sections read as a long unbroken paragraph — break these into short, scannable bullet points.")

    if word_count > 700:
        issues.append(f"Resume content is long (~{word_count} words) — freshers should aim for a single page (roughly 400-550 words).")

    words = [w.strip(".,()") for w in text.split()]
    from collections import Counter
    common = Counter(w.lower() for w in words if len(w) > 5)
    repeated = [w for w, c in common.most_common(8) if c >= 5]
    if repeated:
        issues.append(f"These words repeat often and may look repetitive to a recruiter: {', '.join(repeated[:5])}.")

    if not any(k in lower for k in ["linkedin", "github"]):
        issues.append("No LinkedIn or GitHub link detected — add at least one so recruiters can verify your work.")

    quality_score = max(0, 100 - 12 * len(issues))

    return jsonify({
        "qualityScore": quality_score,
        "issues": issues or ["No major quality issues detected — nice work."],
        "wordCount": word_count,
    }), 200


DOC_EXTRACT_SYSTEM_PROMPT = """You are a strict, literal information-extraction engine reading ONE \
uploaded career document (an internship certificate, offer letter, completion certificate, \
experience letter, internship report, or project report). Text was extracted from the file by a \
PDF/DOCX text layer, so it may contain minor line-break or spacing artifacts — read through those.

ABSOLUTE RULE — DO NOT INVENT ANYTHING:
You must NEVER guess, infer beyond what is explicitly written, or fabricate a value. For every \
field, only fill it in if it is literally present (or unambiguously stated) in the document text. \
If a field is not present, you MUST return the exact string "Not Found" for that field (or an \
empty array [] for list fields) — never a placeholder, never a guess, never "N/A" or "Unknown".

Respond with ONLY one raw JSON object, no markdown fences, no commentary, in exactly this shape:
{
  "documentType": "Internship Certificate|Offer Letter|Completion Certificate|Experience Letter|Internship Report|Project Report|Other|Not Found",
  "companyName": "", "role": "", "internshipType": "", "duration": "",
  "startDate": "", "endDate": "", "location": "", "technologiesUsed": [],
  "department": "", "reportingManager": "", "companyWebsite": "", "stipend": "",
  "responsibilities": [], "contributions": [], "projects": [], "achievements": [],
  "confidence": "high|medium|low"
}
"confidence" reflects how clearly the document's text supports the fields you filled in (low if \
the extracted text looks garbled or sparse). Output ONLY the JSON object."""


@app.route("/api/document-extract", methods=["POST"])
def document_extract():
    """
    Document Intelligence — takes text already extracted client-side (via
    PDF.js/Mammoth, same libraries the rest of the app uses for resume
    uploads) from an internship certificate/offer letter/experience
    letter/report, and asks the AI to pull out structured fields.

    Anti-hallucination by design: the prompt requires "Not Found" instead
    of guessing, and this handler never fills in a value the model didn't
    return — normalize_document_extract() below only supplies neutral
    defaults ("Not Found" / []), never invented content.
    """
    body = request.get_json(silent=True) or {}
    doc_text = (body.get("text") or "").strip()
    file_name = (body.get("fileName") or "").strip()

    if not doc_text or len(doc_text) < 20:
        return jsonify({"error": "Could not read enough text from this document. Try a clearer PDF/DOCX, or a different export."}), 400

    user_prompt = f"Uploaded file name: {file_name or 'unknown'}\n\nDocument text:\n{doc_text[:8000]}"

    try:
        raw = call_ai(DOC_EXTRACT_SYSTEM_PROMPT, user_prompt, max_tokens=1200, temperature=0.0)
        result = extract_json(raw)
    except AIProviderError as exc:
        return jsonify({"error": str(exc)}), 503
    except (ValueError, json.JSONDecodeError):
        return jsonify({"error": "AI response could not be parsed as JSON."}), 502
    except Exception as exc:  # noqa: BLE001
        logger.exception("document-extract failed")
        return jsonify({"error": "Unexpected server error.", "detail": str(exc)}), 500

    return jsonify(normalize_document_extract(result)), 200


def normalize_document_extract(result: dict) -> dict:
    """Fills in only neutral 'Not Found' / empty defaults for any field the
    model omitted — never invents content of its own."""
    if not isinstance(result, dict):
        result = {}
    string_fields = [
        "documentType", "companyName", "role", "internshipType", "duration",
        "startDate", "endDate", "location", "department", "reportingManager",
        "companyWebsite", "stipend",
    ]
    list_fields = ["technologiesUsed", "responsibilities", "contributions", "projects", "achievements"]
    for f in string_fields:
        if not result.get(f):
            result[f] = "Not Found"
    for f in list_fields:
        if not isinstance(result.get(f), list):
            result[f] = []
    if result.get("confidence") not in ("high", "medium", "low"):
        result["confidence"] = "low"
    return result


# ─────────────────────────────────────────────────────────────
# Static frontend (unchanged files) + health check
# ─────────────────────────────────────────────────────────────

@app.route("/healthz")
def healthz():
    return jsonify({
        "status": "ok",
        "providers_configured": {
            "claude": bool(CLAUDE_API_KEY),
            "openai": bool(OPENAI_API_KEY),
            "gemini": bool(GEMINI_API_KEY),
        },
    })


@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    """
    Serves every existing static file (css, js, the portfolio/ folder,
    images, etc.) exactly as before, with no changes to file names or
    folder structure. Directory requests (e.g. /portfolio/) resolve to
    that folder's own index.html. Unknown paths fall back to the site's
    root index.html so any client-side page routing keeps working.
    """
    full_path = os.path.join(FRONTEND_DIR, path)

    if os.path.isfile(full_path):
        return send_from_directory(FRONTEND_DIR, path)

    if os.path.isdir(full_path) and os.path.isfile(os.path.join(full_path, "index.html")):
        return send_from_directory(full_path, "index.html")

    return send_from_directory(FRONTEND_DIR, "index.html")


# ─────────────────────────────────────────────────────────────
# Error handlers
# ─────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(_e):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)

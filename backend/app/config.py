from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR = Path(os.getenv("CLASHFREE_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = Path(os.getenv("CLASHFREE_DB_PATH", DATA_DIR / "clashfree.db"))
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "").strip() or None
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/api/integrations/google/callback"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
ENABLE_PLAYWRIGHT = os.getenv("ENABLE_PLAYWRIGHT", "0") == "1"

NOTIFICATIONS_TO = os.getenv("NOTIFICATIONS_TO", "buddy@northfield.edu").strip()
NOTIFICATIONS_FROM = os.getenv("NOTIFICATIONS_FROM", "clashfree@northfield.edu").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
try:
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
except ValueError:
    SMTP_PORT = 587
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "0") == "1"
SMTP_STARTTLS = os.getenv("SMTP_STARTTLS", "1") == "1"

OUTBOX_DIR = DATA_DIR / "outbox"
OUTBOX_DIR.mkdir(parents=True, exist_ok=True)


GOOGLE_TOKEN_PATH = DATA_DIR / "google_token.json"

DEFAULT_SETTINGS = {
    "institution": "Northfield University",
    "termName": "Fall Semester 2026",
    "termStart": "2026-08-24",
    "termEnd": "2026-12-18",
    "readingWeekStart": "2026-10-26",
    "readingWeekEnd": "2026-10-30",
    "timezone": "Asia/Kolkata",
    "holidays": [
        {"date": "2026-09-07", "name": "Labor Day"},
        {"date": "2026-11-26", "name": "Thanksgiving"},
        {"date": "2026-11-27", "name": "Campus Holiday"},
    ],
}

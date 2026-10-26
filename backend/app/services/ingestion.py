from __future__ import annotations

import hashlib
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from ..config import ENABLE_PLAYWRIGHT, UPLOAD_DIR
from ..utils import new_id, trace_id, utc_now

MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".ics"}


def _content_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()


def _safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", filename or "upload").strip("-")
    return cleaned[:100] or "upload"


def _text_from_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        return "\n".join(pages)
    except Exception:
        return ""


def _html_to_schedule_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    lines: list[str] = []
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])]
            cells = [cell for cell in cells if cell]
            if len(cells) >= 2:
                lines.append(" | ".join(cells))
        lines.append("")
    if lines:
        return "\n".join(lines)

    text = soup.get_text("\n", strip=True)
    return re.sub(r"\n{3,}", "\n\n", text)


def _scrape_dynamic(url: str) -> str:
    if not ENABLE_PLAYWRIGHT:
        return ""
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=30000)
            html = page.content()
            browser.close()
        return _html_to_schedule_text(html)
    except Exception:
        return ""


def fetch_url(url: str) -> dict[str, str]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Enter a valid http(s) URL.")

    with httpx.Client(
        follow_redirects=True,
        timeout=25,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 ClashFree/1.0"
            )
        },
    ) as client:
        response = client.get(url)
        response.raise_for_status()
        content = response.content
        if len(content) > MAX_DOWNLOAD_BYTES:
            raise ValueError("That page is too large to ingest (15 MB limit).")
        content_type = response.headers.get("content-type", "").split(";")[0].lower()
        filename = Path(parsed.path).name or "web-schedule"

    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        stored = UPLOAD_DIR / f"{new_id('web')}.pdf"
        stored.write_bytes(content)
        text = _text_from_pdf(stored)
        image_path = ""
        kind = "pdf"
    elif content_type.startswith("image/"):
        extension = mimetypes.guess_extension(content_type) or ".png"
        stored = UPLOAD_DIR / f"{new_id('web')}{extension}"
        stored.write_bytes(content)
        text = ""
        image_path = str(stored)
        kind = "image"
    elif content_type in {"text/calendar", "text/plain", "text/csv", "application/json"}:
        text = content.decode(response.encoding or "utf-8", errors="replace")
        image_path = ""
        kind = "text"
    else:
        decoded = content.decode(response.encoding or "utf-8", errors="replace")
        text = _html_to_schedule_text(decoded)
        if len(text.strip()) < 120:
            dynamic = _scrape_dynamic(url)
            if dynamic.strip():
                text = dynamic
        image_path = ""
        kind = "web"

    name = parsed.netloc + (parsed.path.rstrip("/")[-42:] if parsed.path and parsed.path != "/" else "")
    return {
        "id": new_id("src"),
        "name": name or "Web timetable",
        "kind": "url",
        "location": url,
        "raw_text": text,
        "image_path": image_path,
        "content_hash": _content_hash(text or image_path),
        "source_kind": kind,
        "created_at": utc_now(),
        "trace_id": trace_id(),
    }


def read_upload(filename: str, content: bytes) -> dict[str, str]:
    if len(content) > MAX_DOWNLOAD_BYTES:
        raise ValueError("File is too large (15 MB limit).")
    safe_name = _safe_filename(filename)
    extension = Path(safe_name).suffix.lower()
    stored = UPLOAD_DIR / f"{new_id('upl')}_{safe_name}"
    stored.write_bytes(content)

    image_path = ""
    source_kind = "text"
    if extension == ".pdf":
        text = _text_from_pdf(stored)
        source_kind = "pdf"
    elif extension in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}:
        text = ""
        image_path = str(stored)
        source_kind = "image"
    elif extension in TEXT_EXTENSIONS:
        text = content.decode("utf-8-sig", errors="replace")
    else:
        # Last-ditch attempt at reading unknown text-like formats.
        text = content.decode("utf-8", errors="replace")
        if text.count("\ufffd") > max(10, len(text) // 20):
            text = ""

    return {
        "id": new_id("src"),
        "name": filename or stored.name,
        "kind": "file",
        "location": str(stored),
        "raw_text": text,
        "image_path": image_path,
        "content_hash": _content_hash(text or hashlib.sha256(content).hexdigest()),
        "source_kind": source_kind,
        "created_at": utc_now(),
        "trace_id": trace_id(),
    }


def summarize_source_input(raw_text: str, image_path: str = "") -> dict[str, str]:
    return {
        "preview": (raw_text or "")[:1200],
        "kind": "image" if image_path else "text",
        "character_count": str(len(raw_text or "")),
    }


def parse_ics_events(raw: str) -> list[dict[str, str]]:
    """Small, dependency-free ICS reader for re-importing exported schedules."""

    events = []
    for block in re.split(r"BEGIN:VEVENT", raw, flags=re.IGNORECASE)[1:]:
        block = block.split("END:VEVENT")[0]

        def field(name: str) -> str:
            match = re.search(rf"^{name}[^:]*:(.+)$", block, re.MULTILINE | re.IGNORECASE)
            return match.group(1).strip() if match else ""

        summary = field("SUMMARY")
        location = field("LOCATION")
        description = field("DESCRIPTION")
        dtstart = field("DTSTART")
        dtend = field("DTEND")
        rrule = field("RRULE")
        if not summary:
            continue
        event: dict[str, str] = {
            "title": summary,
            "room": location,
            "description": description,
        }
        if len(dtstart) >= 13:
            event["event_date"] = f"{dtstart[:4]}-{dtstart[4:6]}-{dtstart[6:8]}"
            event["start_time"] = f"{dtstart[9:11]}:{dtstart[11:13]}"
        if len(dtend) >= 13:
            event["end_time"] = f"{dtend[9:11]}:{dtend[11:13]}"
        byday = re.search(r"BYDAY=([A-Z,]+)", rrule or "")
        if byday:
            mapping = {"MO": "Mon", "TU": "Tue", "WE": "Wed", "TH": "Thu", "FR": "Fri", "SA": "Sat", "SU": "Sun"}
            event["days"] = [mapping[d] for d in byday.group(1).split(",") if d in mapping]
        events.append(event)
    return events


def detect_file_kind(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".") or "text"

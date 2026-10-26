"""ClashFree schedule extraction.

The deterministic parser is deliberately good enough for clean text, CSV and
simple PDF exports. When an OpenAI-compatible key is configured, the same
normalized schema is produced by a multimodal model, which handles screenshots
and messy PDF tables far more reliably.
"""

from __future__ import annotations

import base64
import csv
import io
import json
import mimetypes
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from ..config import (
    ENABLE_PLAYWRIGHT,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENAI_MODEL,
)

DAY_ALIASES = {
    "monday": "Mon",
    "mon": "Mon",
    "mo": "Mon",
    "tuesday": "Tue",
    "tues": "Tue",
    "tue": "Tue",
    "tu": "Tue",
    "wednesday": "Wed",
    "weds": "Wed",
    "wed": "Wed",
    "we": "Wed",
    "thursday": "Thu",
    "thurs": "Thu",
    "thur": "Thu",
    "thu": "Thu",
    "th": "Thu",
    "friday": "Fri",
    "fri": "Fri",
    "fr": "Fri",
    "saturday": "Sat",
    "sat": "Sat",
    "sa": "Sat",
    "sunday": "Sun",
    "sun": "Sun",
    "su": "Sun",
}
DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TYPE_ALIASES = {
    "lecture": "lecture",
    "lec": "lecture",
    "class": "lecture",
    "lab": "lab",
    "laboratory": "lab",
    "practical": "lab",
    "tutorial": "tutorial",
    "seminar": "seminar",
    "exam": "exam",
    "midterm": "exam",
    "final": "exam",
    "test": "exam",
    "quiz": "exam",
}
TIME_RANGE_RE = re.compile(
    r"\b(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b",
    re.IGNORECASE,
)
DATE_RE = re.compile(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b")
COURSE_CODE_RE = re.compile(r"\b([A-Z]{2,5})\s*[- ]?\s*(\d{3,4}[A-Z]?)\b")
LOW_QUALITY_RE = re.compile(r"(?:█|�|\?\?\?|undefined|null|n/?a\b)", re.IGNORECASE)


def sample_timetable() -> str:
    return """# Northfield University — Fall Semester 2026 Master Timetable
# Format: course|title|type|days|time|room|section|instructor|requirement
CS 201|Data Structures & Algorithms|Lecture|Mon, Wed|09:00-10:30|LT-3|A|Dr. Meera Rao|core
ECO 210|Behavioral Economics|Elective|Mon, Wed|10:00-11:30|Room 12|A|Dr. Julian Park|elective
CS 201L|Data Structures Lab|Lab|Thu|14:00-16:00|Lab 2|A|TA Rohan Iyer|core
DES 110|Design Studio|Elective|Thu|15:00-17:00|Studio 4|B|Prof. Ana Silva|elective
MTH 204|Discrete Mathematics|Lecture|Tue, Thu|11:00-12:30|Room 204|B|Dr. Kenji Mori|core
PHY 101|Physics I|Lecture|Fri|09:00-10:30|Hall B|C|Dr. Leah Grant|core
ENG 105|Technical Writing|Lecture|Tue|14:00-15:30|Room 7|D|Prof. Noah Bell|elective
CS 201|Data Structures Midterm|Exam|2026-11-12|09:00-11:00|Examination Hall A|A|Dr. Meera Rao|core
BIO 115|Genetics|Lecture|Mon|██:██-██:██|Room ???|A|Dr. M. Ortiz|elective
"""


def _day_list(value: str) -> list[str]:
    found: list[str] = []
    for token in re.split(r"[,/&+\s]+", (value or "").strip()):
        key = token.lower().strip(".")
        if key in DAY_ALIASES:
            day = DAY_ALIASES[key]
            if day not in found:
                found.append(day)
    return sorted(found, key=DAY_ORDER.index)


def _normalize_time(hour: str, minute: str | None, suffix: str | None) -> str:
    h = int(hour)
    m = int(minute or 0)
    if suffix:
        suffix = suffix.lower()
        if suffix == "pm" and h < 12:
            h += 12
        if suffix == "am" and h == 12:
            h = 0
    if h > 23:
        h = h % 24
    return f"{h:02d}:{m:02d}"


def _normalize_clock(value: str | None) -> str | None:
    """Convert '9:00', '09:00' or '9.00 am' to a clean HH:MM value."""
    if not value:
        return None
    match = re.search(r"(\d{1,2})(?::|\.|\s)?(\d{2})?\s*(am|pm)?", str(value), re.I)
    if not match:
        return None
    return _normalize_time(match.group(1), match.group(2), match.group(3))


def _extract_time(text: str) -> tuple[str | None, str | None]:
    # Mask calendar dates first, otherwise "2026-11-12" is read as 11:00–12:00.
    masked = DATE_RE.sub(" ", text or "")
    masked = re.sub(r"\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b", " ", masked)
    match = TIME_RANGE_RE.search(masked)
    if not match:
        return None, None
    start = _normalize_time(match.group(1), match.group(2), match.group(5))
    end = _normalize_time(match.group(3), match.group(4), match.group(5))
    return start, end


def _normalize_date(value: str) -> str | None:
    match = DATE_RE.search(value or "")
    if not match:
        return None
    year, month, day = match.groups()
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def _event_type(value: str, title: str = "") -> str:
    text = f"{value} {title}".lower()
    for key, normalized in TYPE_ALIASES.items():
        if re.search(rf"\b{re.escape(key)}\b", text):
            return normalized
    return "lecture"


def _course_code(value: str) -> tuple[str, str]:
    match = COURSE_CODE_RE.search((value or "").upper())
    if match:
        return f"{match.group(1)} {match.group(2)}", value.strip()
    return "", value.strip()


def _row_confidence(event: dict[str, Any]) -> float:
    score = 0.48
    if event.get("course_code"):
        score += 0.14
    if event.get("title"):
        score += 0.08
    if event.get("start_time") and event.get("end_time"):
        score += 0.15
    if event.get("days") or event.get("event_date"):
        score += 0.09
    if event.get("room"):
        score += 0.04
    if LOW_QUALITY_RE.search(f"{event.get('room', '')} {event.get('start_time', '')}"):
        score -= 0.5
    return round(min(max(score, 0.05), 0.99), 2)


def _looks_like_header(fields: list[str]) -> bool:
    text = " ".join(fields).lower()
    return (
        ("course" in text or "subject" in text)
        and ("time" in text or "day" in text)
        and ("room" in text or "location" in text)
    )


def _parse_pipe_row(raw: str, row_number: int) -> dict[str, Any] | None:
    fields = [field.strip() for field in raw.split("|")]
    if _looks_like_header(fields) or len(fields) < 3:
        return None

    zero = fields[0] if len(fields) > 0 else ""
    one = fields[1] if len(fields) > 1 else ""
    two = fields[2] if len(fields) > 2 else ""
    rest = fields[3:] if len(fields) > 3 else []

    joined = " | ".join(fields)
    start, end = _extract_time(joined)
    event_date = _normalize_date(joined)
    days: list[str] = []
    for value in rest + [one, two]:
        days = _day_list(value)
        if days:
            break

    # Also recognise "Mon/Wed 9-10" style rows with fewer columns.
    if not days and len(fields) <= 4:
        days = _day_list(one)

    code, _ = _course_code(zero)
    title = one if code else zero
    if code and one.lower() in {"lecture", "lab", "exam", "tutorial", "seminar"}:
        title = zero
        code, _ = _course_code(zero)

    requirement = " ".join(rest).lower()
    is_core = "core" in requirement or "mandatory" in requirement or "required" in requirement
    event_type = _event_type(two, title)

    # Standard row: days | time | room | section | instructor | requirement.
    # Anchor on the time column so rows with or without a days/date column work.
    time_index = next(
        (index for index, value in enumerate(rest) if _extract_time(value)[0]),
        None,
    )
    room = ""
    section = ""
    instructor = ""
    if time_index is not None:
        tail = rest[time_index + 1 :]
        # Drop the trailing requirement token if present.
        if tail and re.search(r"^(core|elective|mandatory|required)$", tail[-1], re.I):
            tail = tail[:-1]
        if tail:
            room = tail[0]
        if len(tail) >= 2:
            section = tail[1].replace("Section", "").strip()
        if len(tail) >= 3:
            instructor = tail[2]

    candidate = {
        "course_code": code,
        "title": title,
        "event_type": event_type,
        "days": days,
        "start_time": start,
        "end_time": end,
        "event_date": event_date,
        "room": room,
        "section": section.replace("Section", "").strip(),
        "instructor": instructor,
        "is_core": is_core,
        "source_row": row_number,
        "raw_text": raw.strip(),
    }
    candidate["confidence"] = _row_confidence(candidate)
    return candidate


def _parse_flexible_line(raw: str, row_number: int) -> dict[str, Any] | None:
    line = raw.strip()
    if not line or not re.search(r"\d", line):
        return None
    if _looks_like_header(re.split(r"\s{2,}|\t", line)):
        return None

    start, end = _extract_time(line)
    event_date = _normalize_date(line)
    days = _day_list(line)
    code, _ = _course_code(line)
    if not (start and end):
        return None
    if not days and not event_date:
        return None

    stripped = TIME_RANGE_RE.sub(" ", line)
    stripped = DATE_RE.sub(" ", stripped)
    for day_name in list(DAY_ALIASES):
        stripped = re.sub(rf"\b{day_name}\b", " ", stripped, flags=re.IGNORECASE)
    pieces = [p.strip(" -–—,;:") for p in re.split(r"\s{2,}|\t|,", stripped) if p.strip(" -–—,;:")]
    title = pieces[0] if pieces else line
    room = next((p for p in pieces[1:] if re.search(r"\b(room|hall|lab|studio|lt|block)\b", p, re.I)), "")
    candidate = {
        "course_code": code,
        "title": title,
        "event_type": _event_type(line, title),
        "days": days,
        "start_time": start,
        "end_time": end,
        "event_date": event_date,
        "room": room,
        "section": "",
        "instructor": "",
        "is_core": bool(re.search(r"\bcore\b|\bmandatory\b|\brequired\b", line, re.I)),
        "source_row": row_number,
        "raw_text": line,
    }
    candidate["confidence"] = _row_confidence(candidate)
    return candidate


def _parse_csv(raw: str) -> list[dict[str, Any]]:
    try:
        dialect = csv.Sniffer().sniff(raw[:4000], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(raw), dialect=dialect)
    if not reader.fieldnames:
        return []
    aliases = {
        "course_code": {"course_code", "code", "course", "subject", "course id"},
        "title": {"title", "course_title", "course name", "name", "description"},
        "event_type": {"event_type", "type", "activity"},
        "days": {"days", "day", "weekday", "weekdays"},
        "start_time": {"start_time", "start", "from", "begin"},
        "end_time": {"end_time", "end", "to", "finish"},
        "event_date": {"event_date", "date", "exam_date"},
        "room": {"room", "location", "venue", "classroom"},
        "section": {"section", "section_no", "group"},
        "instructor": {"instructor", "teacher", "faculty", "professor"},
        "is_core": {"is_core", "requirement", "core", "mandatory"},
    }
    normalized_headers = {str(name).strip().lower(): name for name in reader.fieldnames}
    mapped = {
        target: next((normalized_headers[a] for a in options if a in normalized_headers), None)
        for target, options in aliases.items()
    }
    rows: list[dict[str, Any]] = []
    for index, record in enumerate(reader, start=2):
        value = {key: str(record.get(header) or "").strip() for key, header in mapped.items() if header}
        if not (value.get("title") or value.get("course_code")):
            continue
        start, end = _extract_time(value.get("start_time", "") + "-" + value.get("end_time", ""))
        if not start:
            start, end = _extract_time(" ".join(value.values()))
        event = {
            "course_code": _course_code(value.get("course_code", ""))[0],
            "title": value.get("title") or value.get("course_code", ""),
            "event_type": _event_type(value.get("event_type", ""), value.get("title", "")),
            "days": _day_list(value.get("days", "")),
            "start_time": start,
            "end_time": end,
            "event_date": _normalize_date(value.get("event_date", "")),
            "room": value.get("room", ""),
            "section": value.get("section", ""),
            "instructor": value.get("instructor", ""),
            "is_core": bool(re.search(r"core|mandatory|required|true|yes", value.get("is_core", ""), re.I)),
            "source_row": index,
            "raw_text": " | ".join(str(v) for v in record.values()),
        }
        event["confidence"] = _row_confidence(event)
        rows.append(event)
    return rows


def _parse_json(raw: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if isinstance(payload, dict):
        payload = payload.get("events") or payload.get("schedule") or payload.get("rows") or []
    if not isinstance(payload, list):
        return []
    rows = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            continue
        start_time = _normalize_clock(str(item.get("start_time") or item.get("start") or ""))
        end_time = _normalize_clock(str(item.get("end_time") or item.get("end") or ""))
        if not start_time and item.get("time"):
            start_time, end_time = _extract_time(str(item["time"]))
        event = {
            "course_code": _course_code(str(item.get("course_code") or item.get("course") or ""))[0],
            "title": str(item.get("title") or item.get("course_title") or item.get("course") or ""),
            "event_type": _event_type(str(item.get("event_type") or item.get("type") or "")),
            "days": _day_list(", ".join(item.get("days", [])) if isinstance(item.get("days"), list) else str(item.get("days") or "")),
            "start_time": start_time,
            "end_time": end_time,
            "event_date": _normalize_date(str(item.get("event_date") or item.get("date") or "")),
            "room": str(item.get("room") or item.get("location") or ""),
            "section": str(item.get("section") or ""),
            "instructor": str(item.get("instructor") or ""),
            "is_core": bool(item.get("is_core")),
            "source_row": index,
            "raw_text": json.dumps(item, ensure_ascii=False),
        }
        event["confidence"] = float(item.get("confidence") or _row_confidence(event))
        rows.append(event)
    return rows


def _split_hhmm(value: str) -> tuple[str, str | None, str | None]:
    match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", value, re.I)
    if not match:
        return "0", None, None
    return match.group(1), match.group(2), match.group(3)


def parse_deterministic(raw_text: str, filename: str = "") -> dict[str, Any]:
    text = (raw_text or "").strip()
    if not text:
        return {"events": [], "unparsed": [], "engine": "deterministic"}

    if filename.lower().endswith(".json") or text.startswith("{") or text.startswith("["):
        json_rows = _parse_json(text)
        if json_rows:
            return {"events": json_rows, "unparsed": [], "engine": "deterministic-json"}

    if filename.lower().endswith(".csv") or ("," in text[:500] and "\n" in text and "|" not in text[:1000]):
        csv_rows = _parse_csv(text)
        if csv_rows:
            return {"events": csv_rows, "unparsed": [], "engine": "deterministic-csv"}

    events: list[dict[str, Any]] = []
    unparsed: list[dict[str, Any]] = []
    lines = [line.strip() for line in text.splitlines()]
    for index, line in enumerate(lines, start=1):
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        if len(line) < 8:
            continue
        parsed = _parse_pipe_row(line, index) if "|" in line else _parse_flexible_line(line, index)
        if not parsed:
            # Long prose is usually a source heading, not a schedule row.
            if len(line) > 45 and not re.search(r"\d{1,2}:\d{2}", line):
                continue
            parsed = None
        if not parsed or parsed["confidence"] < 0.45:
            reason = "Unreadable or incomplete schedule row"
            if LOW_QUALITY_RE.search(line):
                reason = "Low quality / corrupted characters — needs human translation"
            elif parsed and parsed.get("start_time") and not (parsed.get("days") or parsed.get("event_date")):
                reason = "Missing weekday or date"
            elif not (parsed and parsed.get("start_time")):
                reason = "Missing a valid start and end time"
            unparsed.append(
                {
                    "raw_text": line,
                    "reason": reason,
                    "confidence": parsed["confidence"] if parsed else 0.1,
                    "source_row": index,
                }
            )
            continue
        events.append(parsed)
    return {"events": events, "unparsed": unparsed, "engine": "deterministic"}


def _llm_prompt() -> str:
    return """You extract university timetable data from messy source material.
Return ONLY JSON with this shape:
{
  "events": [{
    "course_code": "CS 201",
    "title": "Data Structures & Algorithms",
    "event_type": "lecture|lab|exam|tutorial|seminar",
    "days": ["Mon", "Wed"],
    "start_time": "09:00",
    "end_time": "10:30",
    "event_date": "YYYY-MM-DD or null",
    "room": "LT-3",
    "section": "A",
    "instructor": "Dr. Meera Rao",
    "is_core": true,
    "confidence": 0.95,
    "source_row": 4,
    "raw_text": "the exact source row"
  }],
  "unparsed": [{
    "raw_text": "exact unreadable row",
    "reason": "why it cannot be trusted",
    "confidence": 0.1,
    "source_row": 9
  }]
}
Rules:
- Never invent a course, time, room, or date. If a value is unreadable, put the row in unparsed.
- Use 24-hour HH:MM times. Use three-letter weekdays (Mon, Tue...). For one-off exams use event_date.
- is_core is true only for mandatory/core courses, not electives.
- Keep confidence below 0.5 if any critical field (time/day/date) is uncertain.
- Include every schedule row, but ignore headers, instructions and boilerplate.
"""


def _llm_extract(raw_text: str, image_path: Path | None = None) -> dict[str, Any] | None:
    if not OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    "Extract the complete timetable from this source. "
                    "Preserve exact source evidence for traceability.\n\n"
                    + raw_text[:60000]
                ),
            }
        ]
        if image_path and image_path.exists():
            mime = mimetypes.guess_type(image_path.name)[0] or "image/png"
            encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{encoded}", "detail": "high"},
                }
            )
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _llm_prompt()},
                {"role": "user", "content": content},
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=6000,
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        events = payload.get("events") or []
        unparsed = payload.get("unparsed") or []
        normalized_events = _normalize_llm_events(events)
        normalized_unparsed = [
            {
                "raw_text": str(row.get("raw_text") or ""),
                "reason": str(row.get("reason") or "Low extraction confidence"),
                "confidence": float(row.get("confidence") or 0.1),
                "source_row": int(row.get("source_row") or 0),
            }
            for row in unparsed
            if isinstance(row, dict)
        ]
        return {
            "events": normalized_events,
            "unparsed": normalized_unparsed,
            "engine": f"openai:{OPENAI_MODEL}",
        }
    except Exception as force_fallback_error:  # pragma: no cover - network path
        return {
            "events": [],
            "unparsed": [],
            "engine": "deterministic",
            "llm_error": str(force_fallback_error),
        }


def _normalize_llm_events(events: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(events, start=1):
        if not isinstance(item, dict):
            continue
        start = _normalize_clock(str(item.get("start_time") or item.get("start") or ""))
        end = _normalize_clock(str(item.get("end_time") or item.get("end") or ""))
        if not start:
            start, end = _extract_time(str(item.get("time") or ""))
        days = _day_list(", ".join(item.get("days") or [])) if isinstance(item.get("days"), list) else _day_list(str(item.get("days") or ""))
        event = {
            "course_code": _course_code(str(item.get("course_code") or ""))[0],
            "title": str(item.get("title") or item.get("course_code") or "Untitled course"),
            "event_type": _event_type(str(item.get("event_type") or "")),
            "days": days,
            "start_time": start,
            "end_time": end,
            "event_date": _normalize_date(str(item.get("event_date") or "")),
            "room": str(item.get("room") or ""),
            "section": str(item.get("section") or ""),
            "instructor": str(item.get("instructor") or ""),
            "is_core": bool(item.get("is_core")),
            "confidence": float(item.get("confidence") or _row_confidence(item)),
            "source_row": int(item.get("source_row") or index),
            "raw_text": str(item.get("raw_text") or json.dumps(item, ensure_ascii=False)),
        }
        if not event["title"]:
            event["title"] = event["course_code"] or "Untitled course"
        if not (event["days"] or event["event_date"]) or not (event["start_time"] and event["end_time"]):
            continue
        event["confidence"] = round(max(0.0, min(event["confidence"], 1.0)), 2)
        normalized.append(event)
    return normalized


def extract_schedule(
    raw_text: str,
    filename: str = "",
    image_path: Path | None = None,
    force_fallback: bool = False,
) -> dict[str, Any]:
    """Extract a normalized schedule from text or an image."""

    if image_path and not OPENAI_API_KEY and not force_fallback:
        return {
            "events": [],
            "unparsed": [
                {
                    "raw_text": f"[Image: {image_path.name}]",
                    "reason": "Image OCR needs an AI key. Add OPENAI_API_KEY or upload a text-based PDF.",
                    "confidence": 0.0,
                    "source_row": 1,
                }
            ],
            "engine": "image-unconfigured",
        }

    if not force_fallback and OPENAI_API_KEY and (raw_text or image_path):
        result = _llm_extract(raw_text, image_path)
        if result and result["events"]:
            return result
        if not raw_text and result:
            fallback = parse_deterministic("", filename)
            fallback["llm_error"] = result.get("llm_error")
            return fallback

    result = parse_deterministic(raw_text, filename)
    if image_path:
        result["unparsed"].append(
            {
                "raw_text": f"[Image: {image_path.name}]",
                "reason": "Image could not be read automatically",
                "confidence": 0.0,
                "source_row": 1,
            }
        )
    return result


def events_fingerprint(event: dict[str, Any]) -> str:
    import hashlib

    payload = {
        "title": event.get("title"),
        "course_code": event.get("course_code"),
        "event_type": event.get("event_type"),
        "days": event.get("days"),
        "start_time": event.get("start_time"),
        "end_time": event.get("end_time"),
        "event_date": event.get("event_date"),
        "room": event.get("room"),
        "section": event.get("section"),
        "instructor": event.get("instructor"),
        "is_core": event.get("is_core"),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def identity_key(event: dict[str, Any]) -> str:
    code = (event.get("course_code") or "").upper().strip()
    title = re.sub(r"[^a-z0-9]+", "-", (event.get("title") or "").lower()).strip("-")[:40]
    section = (event.get("section") or "").upper().strip()
    event_type = event.get("event_type") or "lecture"
    base = code or title or "unknown"
    return f"{base}:{section}:{event_type}".lower()


def parse_source(source_text: str, filename: str = "") -> dict[str, Any]:
    return extract_schedule(source_text, filename=filename)

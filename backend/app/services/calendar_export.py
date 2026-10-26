from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime, timedelta
from typing import Any

from ..database import get_db, get_settings

DAY_CODES = {"Mon": "MO", "Tue": "TU", "Wed": "WE", "Thu": "TH", "Fri": "FR", "Sat": "SA", "Sun": "SU"}
DAY_INDEX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}


def _escape(value: str) -> str:
    return (
        (value or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    raw = line.encode("utf-8")
    if len(raw) <= 73:
        return line
    output = []
    current = b""
    for char in line:
        chunk = char.encode("utf-8")
        if len(current) + len(chunk) > 73:
            output.append(current.decode("utf-8"))
            current = b" "
        current += chunk
    if current:
        output.append(current.decode("utf-8"))
    return "\r\n".join(output)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _first_occurrence(days: list[str], term_start: date, term_end: date) -> date | None:
    candidates = []
    for day in days:
        offset = DAY_INDEX.get(day)
        if offset is None:
            continue
        candidate = term_start + timedelta(days=(offset - term_start.weekday()) % 7)
        if candidate <= term_end:
            candidates.append(candidate)
    return min(candidates) if candidates else None


def _exdates(days: list[str], settings: dict[str, Any], start_time: str) -> list[str]:
    excluded: set[date] = set()
    holidays = settings.get("holidays") or []
    if isinstance(holidays, list):
        for holiday in holidays:
            parsed = _parse_date(holiday.get("date") if isinstance(holiday, dict) else str(holiday))
            if parsed and parsed.strftime("%a") in days:
                excluded.add(parsed)
    reading_start = _parse_date(settings.get("readingWeekStart"))
    reading_end = _parse_date(settings.get("readingWeekEnd"))
    if reading_start and reading_end:
        cursor = reading_start
        while cursor <= reading_end:
            if cursor.strftime("%a") in days:
                excluded.add(cursor)
            cursor += timedelta(days=1)
    comp = start_time.replace(":", "") + "00"
    return [f"EXDATE;TZID={settings.get('timezone')}:{day.strftime('%Y%m%d')}T{comp}" for day in sorted(excluded)]


def _ics_lines() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    settings = get_settings()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM events
            WHERE approved = 1 AND status != 'ignored'
            ORDER BY COALESCE(event_date, '9999-12-31'), start_time
            """
        ).fetchall()
    events = []
    for row in rows:
        item = dict(row)
        import json

        item["days"] = json.loads(item.get("days") or "[]")
        events.append(item)
    return settings, events


def build_ics(events: list[dict[str, Any]] | None = None) -> str:
    settings = get_settings()
    if events is None:
        _, events = _ics_lines()
    term_start = _parse_date(settings.get("termStart")) or date.today()
    term_end = _parse_date(settings.get("termEnd")) or (term_start + timedelta(days=120))
    timezone = settings.get("timezone") or "Asia/Kolkata"
    now = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ClashFree//Schedule Intelligence//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:ClashFree · {_escape(settings.get('termName', 'Academic term'))}",
        f"X-WR-TIMEZONE:{timezone}",
        "BEGIN:VTIMEZONE",
        f"TZID:{timezone}",
        f"X-LIC-LOCATION:{timezone}",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0530",
        "TZOFFSETTO:+0530",
        "TZNAME:IST",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]

    for event in events:
        days = event.get("days") or []
        exam_date = _parse_date(event.get("event_date"))
        start_time = (event.get("start_time") or "09:00").replace(":", "") + "00"
        end_time = (event.get("end_time") or "10:00").replace(":", "") + "00"
        uid_hash = hashlib.sha1(f"{event.get('id')}@clashfree".encode()).hexdigest()[:24]
        event_lines = [
            "BEGIN:VEVENT",
            f"UID:{uid_hash}@clashfree.local",
            f"DTSTAMP:{now}",
            f"SUMMARY:{_escape((event.get('course_code') + ' · ' if event.get('course_code') else '') + event.get('title', 'Class'))}",
            f"LOCATION:{_escape(event.get('room') or 'Room TBC')}",
            (
                "DESCRIPTION:"
                + _escape(
                    f"Imported by ClashFree. Type: {event.get('event_type', 'lecture')}. "
                    f"Section: {event.get('section') or '—'}. "
                    f"Instructor: {event.get('instructor') or '—'}. "
                    f"Trace: {event.get('trace_id', '—')}."
                )
            ),
            "STATUS:CONFIRMED",
            "TRANSP:OPAQUE",
            f"CATEGORIES:{'Core' if event.get('is_core') else 'Elective'}",
        ]
        if exam_date:
            event_lines.append(f"DTSTART;TZID={timezone}:{exam_date.strftime('%Y%m%d')}T{start_time}")
            event_lines.append(f"DTEND;TZID={timezone}:{exam_date.strftime('%Y%m%d')}T{end_time}")
        else:
            first = _first_occurrence(days, term_start, term_end)
            if not first:
                continue
            byday = ",".join(DAY_CODES[day] for day in days if day in DAY_CODES)
            event_lines.append(f"DTSTART;TZID={timezone}:{first.strftime('%Y%m%d')}T{start_time}")
            event_lines.append(f"DTEND;TZID={timezone}:{first.strftime('%Y%m%d')}T{end_time}")
            event_lines.append(f"RRULE:FREQ=WEEKLY;BYDAY={byday};UNTIL={term_end.strftime('%Y%m%d')}T235959")
            for exdate in _exdates(days, settings, event.get("start_time") or "09:00"):
                event_lines.append(exdate)
        event_lines.extend(
            [
                f"X-CLASHFREE-EVENT-ID:{event.get('id')}",
                f"X-CLASHFREE-TRACE-ID:{event.get('trace_id')}",
                f"X-CLASHFREE-SOURCE-ID:{event.get('source_id')}",
                "END:VEVENT",
            ]
        )
        lines.extend(event_lines)

    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def approved_events() -> list[dict[str, Any]]:
    import json

    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE approved = 1 AND status != 'ignored' ORDER BY start_time"
        ).fetchall()
    output = []
    for row in rows:
        item = dict(row)
        item["days"] = json.loads(item.get("days") or "[]")
        output.append(item)
    return output


def sync_preview() -> dict[str, Any]:
    events = approved_events()
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) AS n FROM events WHERE status != 'ignored'").fetchone()["n"]
        open_clashes = conn.execute("SELECT COUNT(*) AS n FROM clashes WHERE status = 'open'").fetchone()["n"]
    settings = get_settings()
    recurring = sum(1 for event in events if not event.get("event_date"))
    exams = sum(1 for event in events if event.get("event_date"))
    return {
        "approved": len(events),
        "total": total,
        "recurring": recurring,
        "exams": exams,
        "openClashes": open_clashes,
        "ready": len(events) > 0 and open_clashes == 0,
        "term": settings.get("termName"),
        "termStart": settings.get("termStart"),
        "termEnd": settings.get("termEnd"),
        "format": "RFC 5545 (.ics) · Google Calendar compatible",
    }


def record_sync(provider: str, status: str, count: int, message: str) -> None:
    from ..utils import new_id, utc_now

    with get_db() as conn:
        conn.execute(
            "INSERT INTO sync_runs (id, provider, status, event_count, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (new_id("sync"), provider, status, count, message, utc_now()),
        )


def mark_synced(event_ids: list[str], provider: str) -> None:
    if not event_ids:
        return
    from ..utils import utc_now

    placeholders = ",".join("?" for _ in event_ids)
    with get_db() as conn:
        conn.execute(
            f"UPDATE events SET synced = 1, updated_at = ? WHERE id IN ({placeholders})",
            [utc_now(), *event_ids],
        )
    record_sync(provider, "success", len(event_ids), f"Synced {len(event_ids)} events to {provider}.")

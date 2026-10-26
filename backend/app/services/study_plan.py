"""Deterministic study-timetable agent.

Every course that appears on the verified timetable gets one focused 60-minute
study block. The block is placed on the day *before* the course next meets, at
an evening slot that does not overlap any class or another study block, and it
skips holidays and reading week.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime, timedelta
from typing import Any

from ..database import get_db, get_settings
from ..utils import utc_now
from .calendar_export import (
    DAY_CODES,
    DAY_INDEX,
    _escape,
    _exdates,
    _first_occurrence,
    _fold,
    _parse_date,
)

DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DAY_LABELS = {
    "Mon": "Monday",
    "Tue": "Tuesday",
    "Wed": "Wednesday",
    "Thu": "Thursday",
    "Fri": "Friday",
    "Sat": "Saturday",
    "Sun": "Sunday",
}
BLOCK_MINUTES = 60
PREFERRED_STARTS = [
    "17:00",
    "18:00",
    "16:00",
    "19:00",
    "15:00",
    "20:00",
    "14:00",
    "11:00",
    "10:00",
    "09:00",
    "12:00",
    "13:00",
]
FOCUS_BY_TYPE = {
    "lecture": "Rework this week's examples and summarise the lecture in your own words.",
    "lab": "Prep the lab steps, tidy your working notes, and list open questions.",
    "tutorial": "Attempt the problem set before the tutorial and mark the tricky parts.",
    "seminar": "Read the set text and note two discussion points to raise.",
}
METHODOLOGY = (
    "The study agent reads the verified timetable, groups it by course, and reserves one focused "
    "60-minute block per course on the day before that course next meets. Blocks avoid every class "
    "slot already on your timetable, other study blocks, holidays, and reading week. They are "
    "suggestions only: nothing is written to your calendar until you export or sync it."
)


def _minutes(value: str | None) -> int | None:
    if not value:
        return None
    try:
        hour, minute = value.split(":")[:2]
        return int(hour) * 60 + int(minute)
    except (TypeError, ValueError):
        return None


def _clock(total: int) -> str:
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def _day_before(day: str) -> str:
    return DAY_ORDER[(DAY_INDEX[day] - 1) % 7]


def _shift_day(day: str, offset: int) -> str:
    return DAY_ORDER[(DAY_INDEX[day] + offset) % 7]


def _holiday_dates(settings: dict[str, Any]) -> set[date]:
    dates: set[date] = set()
    holidays = settings.get("holidays") or []
    if isinstance(holidays, list):
        for holiday in holidays:
            parsed = _parse_date(holiday.get("date") if isinstance(holiday, dict) else str(holiday))
            if parsed:
                dates.add(parsed)
    return dates


def _reading_week(settings: dict[str, Any]) -> tuple[date | None, date | None]:
    return _parse_date(settings.get("readingWeekStart")), _parse_date(settings.get("readingWeekEnd"))


def _is_blocked_date(value: date, settings: dict[str, Any]) -> bool:
    if value in _holiday_dates(settings):
        return True
    start, end = _reading_week(settings)
    return bool(start and end and start <= value <= end)


def _next_study_date(
    day: str, today: date, settings: dict[str, Any], anchor_day: str | None = None
) -> date | None:
    """Next occurrence of ``day`` that is not a holiday or in reading week.

    When ``anchor_day`` is supplied, also skip weeks where the class being
    prepped for falls inside a holiday or reading week.
    """
    offset = (DAY_INDEX[day] - today.weekday()) % 7
    candidate = today + timedelta(days=offset)
    term_end = _parse_date(settings.get("termEnd"))
    for _ in range(24):
        if term_end and candidate > term_end:
            return None
        blocked = _is_blocked_date(candidate, settings)
        if not blocked and anchor_day:
            class_offset = (DAY_INDEX[anchor_day] - candidate.weekday()) % 7
            blocked = _is_blocked_date(candidate + timedelta(days=class_offset), settings)
        if not blocked:
            return candidate
        candidate += timedelta(days=7)
    return None


def _load_courses() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    settings = get_settings()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM events
            WHERE status != 'ignored'
            ORDER BY course_code, COALESCE(event_date, '9999-12-31'), start_time
            """
        ).fetchall()

    events: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        item["days"] = json.loads(item.get("days") or "[]")
        events.append(item)

    courses: dict[str, dict[str, Any]] = {}
    exams: dict[str, dict[str, Any]] = {}
    for event in events:
        code = (event.get("course_code") or event.get("title") or "").strip()
        if not code:
            continue
        if event.get("event_date") or event.get("event_type") == "exam":
            exams.setdefault(code, {"date": event.get("event_date"), "title": event.get("title")})
            continue
        if not event.get("days"):
            continue
        course = courses.setdefault(
            code,
            {
                "course_code": code,
                "title": event.get("title") or code,
                "event_types": set(),
                "class_days": set(),
                "times": [],
                "room": event.get("room") or "",
                "instructor": event.get("instructor") or "",
                "is_core": bool(event.get("is_core")),
                "trace_ids": [],
                "approved": True,
            },
        )
        course["event_types"].add(event.get("event_type") or "lecture")
        course["class_days"].update(event.get("days") or [])
        course["times"].append((event.get("start_time"), event.get("end_time")))
        if not course["room"] and event.get("room"):
            course["room"] = event["room"]
        if not course["instructor"] and event.get("instructor"):
            course["instructor"] = event["instructor"]
        course["approved"] = course["approved"] and bool(event.get("approved"))
        if event.get("trace_id"):
            course["trace_ids"].append(event["trace_id"])

    ordered = []
    for key in sorted(courses):
        course = courses[key]
        course["class_days"] = sorted(course["class_days"], key=DAY_ORDER.index)
        times = sorted(
            (item for item in course["times"] if item[0] and item[1]),
            key=lambda item: (_minutes(item[0]) or 0, _minutes(item[1]) or 0),
        )
        course["times"] = times
        course["primary_time"] = times[0] if times else (None, None)
        course["exam"] = exams.get(key)
        ordered.append(course)
    return ordered, settings


def _busy_by_day(events: list[dict[str, Any]]) -> dict[str, list[tuple[int, int]]]:
    busy: dict[str, list[tuple[int, int]]] = {day: [] for day in DAY_ORDER}
    for event in events:
        if event.get("event_date"):
            continue
        start, end = _minutes(event.get("start_time")), _minutes(event.get("end_time"))
        if start is None or end is None or end <= start:
            continue
        for day in event.get("days") or []:
            if day in busy:
                busy[day].append((start, end))
    return busy


def _free_slot(busy: list[tuple[int, int]]) -> str | None:
    for start_label in PREFERRED_STARTS:
        start = _minutes(start_label)
        if start is None:
            continue
        end = start + BLOCK_MINUTES
        if end > 22 * 60:
            continue
        if all(end <= busy_start or start >= busy_end for busy_start, busy_end in busy):
            return start_label
    return None


def _focus(course: dict[str, Any]) -> str:
    types = course.get("event_types") or {"lecture"}
    if "lab" in types:
        base = FOCUS_BY_TYPE["lab"]
    elif "tutorial" in types:
        base = FOCUS_BY_TYPE["tutorial"]
    elif "seminar" in types:
        base = FOCUS_BY_TYPE["seminar"]
    else:
        base = FOCUS_BY_TYPE["lecture"]
    exam = course.get("exam")
    if exam and exam.get("date"):
        parsed = _parse_date(exam["date"])
        if parsed:
            base = f"{base} Midterm {parsed.strftime('%b %d')}: build a one-page revision sheet."
    return base


def _class_summary(course: dict[str, Any]) -> str:
    ranges: list[str] = []
    for start, end in course["times"]:
        if not start or not end:
            continue
        label = f"{start}–{end}"
        if label not in ranges:
            ranges.append(label)
    return " · ".join(ranges) if ranges else "time TBC"


def generate_study_plan(today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    courses, settings = _load_courses()
    with get_db() as conn:
        event_total = conn.execute(
            "SELECT COUNT(*) AS n FROM events WHERE status != 'ignored'"
        ).fetchone()["n"]
        approved_total = conn.execute(
            "SELECT COUNT(*) AS n FROM events WHERE approved = 1 AND status != 'ignored'"
        ).fetchone()["n"]
        rows = conn.execute(
            "SELECT * FROM events WHERE status != 'ignored' AND event_date IS NULL ORDER BY start_time"
        ).fetchall()
    all_events = []
    for row in rows:
        item = dict(row)
        item["days"] = json.loads(item.get("days") or "[]")
        all_events.append(item)
    busy = _busy_by_day(all_events)

    blocks: list[dict[str, Any]] = []
    for course in courses:
        if not course["class_days"]:
            continue
        anchor_day = course["class_days"][0]
        target_day = _day_before(anchor_day)
        chosen_day = target_day
        chosen_start = None
        for attempt in range(7):
            candidate = _shift_day(target_day, attempt)
            # Skip days where this course already meets, unless every other day is taken.
            if candidate in course["class_days"] and attempt < 6:
                continue
            slot = _free_slot(busy.get(candidate, []))
            if slot:
                chosen_day = candidate
                chosen_start = slot
                break
        if not chosen_start:
            continue
        start_minutes = _minutes(chosen_start) or 17 * 60
        end_minutes = start_minutes + BLOCK_MINUTES
        next_date = _next_study_date(chosen_day, today, settings, anchor_day)
        block = {
            "id": f"study_{course['course_code'].lower().replace(' ', '_')}",
            "course_code": course["course_code"],
            "course_title": course["title"],
            "event_type": sorted(course["event_types"])[0],
            "class_days": course["class_days"],
            "class_time": _class_summary(course),
            "room": course["room"] or "Room TBC",
            "instructor": course["instructor"] or "",
            "is_core": course["is_core"],
            "day": chosen_day,
            "date": next_date.isoformat() if next_date else None,
            "start_time": _clock(start_minutes),
            "end_time": _clock(end_minutes),
            "duration_minutes": BLOCK_MINUTES,
            "focus": _focus(course),
            "anchor": " ".join(
                part
                for part in ["Prep for", anchor_day, course["primary_time"][0] or "", "class"]
                if part
            ),
            "exam": (
                {
                    "date": course["exam"].get("date"),
                    "title": course["exam"].get("title") or "Exam",
                }
                if course.get("exam") and course["exam"].get("date")
                else None
            ),
            "trace_ids": course["trace_ids"][:4],
            "approved": course["approved"],
        }
        busy.setdefault(chosen_day, []).append((start_minutes, end_minutes))
        blocks.append(block)

    blocked_dates = _holiday_dates(settings) | {
        day
        for reading in [_reading_week(settings)]
        if reading[0] and reading[1]
        for day in [reading[0] + timedelta(days=offset) for offset in range((reading[1] - reading[0]).days + 1)]
    }
    term_start = _parse_date(settings.get("termStart")) or today
    term_end = _parse_date(settings.get("termEnd")) or (term_start + timedelta(days=120))
    excluded = sum(
        1 for day in blocked_dates if term_start <= day <= term_end and day.strftime("%a") in DAY_CODES
    )

    by_day = []
    for day in DAY_ORDER:
        day_blocks = sorted(
            (block for block in blocks if block["day"] == day),
            key=lambda block: block["start_time"],
        )
        by_day.append({"day": day, "label": DAY_LABELS[day], "blocks": day_blocks})

    study_days = [entry["day"] for entry in by_day if entry["blocks"]]
    return {
        "generatedAt": utc_now(),
        "basedOn": {
            "events": event_total,
            "courses": len(courses),
            "approved": approved_total,
        },
        "summary": {
            "courses": len(courses),
            "blocks": len(blocks),
            "minutes": len(blocks) * BLOCK_MINUTES,
            "hours": round((len(blocks) * BLOCK_MINUTES) / 60, 1),
            "studyDays": study_days,
            "excludedDates": excluded,
            "coverage": f"{len(blocks)} of {len(courses)} courses covered",
        },
        "blocks": blocks,
        "byDay": by_day,
        "methodology": METHODOLOGY,
    }


def build_study_ics(plan: dict[str, Any] | None = None) -> str:
    plan = plan or generate_study_plan()
    settings = get_settings()
    term_start = _parse_date(settings.get("termStart")) or date.today()
    term_end = _parse_date(settings.get("termEnd")) or (term_start + timedelta(days=120))
    timezone = settings.get("timezone") or "Asia/Kolkata"
    now = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ClashFree//Study Agent//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:ClashFree Study · {_escape(settings.get('termName', 'Academic term'))}",
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

    for block in plan["blocks"]:
        days = [block["day"]]
        first = _first_occurrence(days, term_start, term_end)
        if not first:
            continue
        start_time = block["start_time"].replace(":", "") + "00"
        end_time = block["end_time"].replace(":", "") + "00"
        uid_hash = hashlib.sha1(f"{block['id']}@clashfree-study".encode()).hexdigest()[:24]
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid_hash}@clashfree.local",
                f"DTSTAMP:{now}",
                f"SUMMARY:{_escape('Study · ' + block['course_code'] + ' ' + block['course_title'])}",
                f"LOCATION:{_escape('Focus block · ' + block['room'])}",
                (
                    "DESCRIPTION:"
                    + _escape(
                        f"{block['focus']} Anchor: {block['anchor']}. "
                        f"Class: {block['class_time']}. Generated by the ClashFree study agent."
                    )
                ),
                "STATUS:TENTATIVE",
                "TRANSP:TRANSPARENT",
                "CATEGORIES:Study,Study agent",
                f"DTSTART;TZID={timezone}:{first.strftime('%Y%m%d')}T{start_time}",
                f"DTEND;TZID={timezone}:{first.strftime('%Y%m%d')}T{end_time}",
                f"RRULE:FREQ=WEEKLY;BYDAY={DAY_CODES[block['day']]};UNTIL={term_end.strftime('%Y%m%d')}T235959",
            ]
        )
        for exdate in _exdates(days, settings, block["start_time"]):
            lines.append(exdate)
        lines.extend(
            [
                f"X-CLASHFREE-STUDY:{block['id']}",
                f"X-CLASHFREE-COURSE:{block['course_code']}",
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"

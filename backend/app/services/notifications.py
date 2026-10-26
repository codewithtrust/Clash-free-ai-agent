"""Notification centre and email digest for the ClashFree study agent."""

from __future__ import annotations

import html as html_lib
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

from ..config import (
    NOTIFICATIONS_FROM,
    NOTIFICATIONS_TO,
    OUTBOX_DIR,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_STARTTLS,
    SMTP_USE_SSL,
    SMTP_USER,
)
from ..database import get_settings
from ..utils import utc_now
from .calendar_export import sync_preview
from .pipeline import dashboard, list_clashes, list_unparsed
from .study_plan import generate_study_plan

TONE_ORDER = {"danger": 0, "warning": 1, "success": 2, "info": 3}


def _notification(
    key: str,
    kind: str,
    tone: str,
    title: str,
    body: str,
    action: dict[str, str],
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": key,
        "kind": kind,
        "tone": tone,
        "title": title,
        "body": body,
        "action": action,
        "meta": meta or {},
    }


def _course_rows(plan: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for block in plan["blocks"]:
        rows.append(
            {
                "course_code": block["course_code"],
                "title": block["course_title"],
                "class_days": block["class_days"],
                "class_time": block["class_time"],
                "room": block["room"],
                "instructor": block["instructor"],
                "study_day": block["day"],
                "study_date": block["date"],
                "study_time": f"{block['start_time']}–{block['end_time']}",
                "focus": block["focus"],
                "anchor": block["anchor"],
                "is_core": block["is_core"],
                "exam": block["exam"],
            }
        )
    return rows


def build_notifications() -> dict[str, Any]:
    settings = get_settings()
    summary = dashboard()["summary"]
    clashes = list_clashes(include_resolved=False)
    unparsed = list_unparsed()
    plan = generate_study_plan()
    preview = sync_preview()

    notes: list[dict[str, Any]] = []
    for clash in clashes:
        notes.append(
            _notification(
                f"note_{clash['id']}",
                "clash",
                "danger",
                f"Clash · {clash.get('event_a_code') or 'Class A'} vs {clash.get('event_b_code') or 'Class B'}",
                (
                    f"{clash.get('event_a_title')} ({', '.join(clash.get('event_a_days') or [])} "
                    f"{clash.get('event_a_start')}) overlaps {clash.get('event_b_title')} "
                    f"({', '.join(clash.get('event_b_days') or [])} {clash.get('event_b_start')}) "
                    f"by {clash.get('overlap_minutes')} minutes. Both events stay out of the calendar until you resolve it."
                ),
                {"label": "Resolve clash", "to": "/review"},
                {"clashId": clash["id"], "overlapMinutes": clash.get("overlap_minutes")},
            )
        )

    if len(unparsed) <= 3:
        for row in unparsed:
            notes.append(
                _notification(
                    f"note_{row['id']}",
                    "unparsed",
                    "warning",
                    "Quarantined row needs a human read",
                    f"{row.get('raw_text')} — {row.get('reason')} (source row {row.get('source_row') or '—'}). "
                    "The row is held outside the calendar rather than being dropped.",
                    {"label": "Open quarantine bin", "to": "/review"},
                    {"rowId": row["id"]},
                )
            )
    elif unparsed:
        first = unparsed[0]
        notes.append(
            _notification(
                "note_unparsed_group",
                "unparsed",
                "warning",
                f"{len(unparsed)} quarantined rows need a human read",
                (
                    f"{len(unparsed)} rows could not be read with confidence. None were dropped: each keeps its raw "
                    f"text and reason in the quarantine bin. First: {str(first.get('raw_text'))[:70]} — "
                    f"{first.get('reason')}."
                ),
                {"label": "Open quarantine bin", "to": "/review"},
                {"count": len(unparsed)},
            )
        )

    pending = max(summary["events"] - summary["approved"], 0)
    if pending:
        notes.append(
            _notification(
                "note_approval",
                "approval",
                "warning",
                f"{pending} class{'es' if pending != 1 else ''} waiting for approval",
                (
                    f"{summary['approved']} of {summary['events']} verified events are approved. "
                    "Events tied to an open clash cannot be approved until the clash is resolved."
                ),
                {"label": "Review queue", "to": "/review"},
                {"pending": pending},
            )
        )

    if plan["blocks"]:
        next_blocks = sorted(plan["blocks"], key=lambda block: (block["date"] or "", block["start_time"]))[:3]
        next_line = "; ".join(
            f"{block['course_code']} on {block['day']} {block['start_time']}–{block['end_time']}"
            for block in next_blocks
        )
        notes.append(
            _notification(
                "note_study_plan",
                "study",
                "info",
                f"Study timetable ready · {plan['summary']['blocks']} subjects",
                (
                    f"The study agent reserved {plan['summary']['hours']} focused hours across "
                    f"{plan['summary']['courses']} courses. Next up: {next_line}."
                ),
                {"label": "Open study plan", "to": "/study-plan"},
                {"blocks": plan["summary"]["blocks"]},
            )
        )

    if preview["ready"]:
        notes.append(
            _notification(
                "note_sync",
                "sync",
                "success",
                "Calendar is ready to sync",
                (
                    f"{preview['approved']} approved events, zero open clashes. Export an .ics file "
                    "or push to Google Calendar."
                ),
                {"label": "Open calendar", "to": "/calendar"},
                {"approved": preview["approved"]},
            )
        )

    notes.sort(key=lambda item: TONE_ORDER.get(item["tone"], 9))
    courses = _course_rows(plan)
    email = _compose_email(plan=plan, courses=courses, notifications=notes, settings=settings)
    actionable = sum(1 for item in notes if item["kind"] in {"clash", "unparsed", "approval"})
    return {
        "notifications": notes,
        "unread": actionable,
        "updatedAt": utc_now(),
        "courses": courses,
        "studyPlan": plan,
        "email": email,
    }


PT_STYLE = "margin:0 0 6px 0;color:#38463f;font-size:14px;line-height:22px;"
SMALL_STYLE = "margin:0;color:#61756a;font-size:12px;line-height:19px;"


def _compose_email(
    plan: dict[str, Any],
    courses: list[dict[str, Any]],
    notifications: list[dict[str, Any]],
    settings: dict[str, Any],
) -> dict[str, Any]:
    term = settings.get("termName") or "Academic term"
    institution = settings.get("institution") or "your institution"
    block_count = plan["summary"]["blocks"]
    subject = f"ClashFree digest · {term} · {len(courses)} subjects, {block_count} study blocks"

    integrity = [
        f"{len(courses)} subjects on the verified timetable",
        f"{plan['basedOn']['approved']} of {plan['basedOn']['events']} events approved",
        f"{sum(1 for item in notifications if item['kind'] == 'clash')} open clash(es)",
        f"{sum(1 for item in notifications if item['kind'] == 'unparsed')} quarantined row(s)",
    ]

    text_lines = [
        "Hii buddy,",
        "",
        f"Here is your ClashFree digest for {term} at {institution}.",
        "",
        "SCHEDULE INTEGRITY",
        *[f"- {line}" for line in integrity],
        "",
        "YOUR CLASSES AND STUDY BLOCKS",
    ]
    for course in courses:
        text_lines.append(
            f"- {course['course_code']} · {course['title']}\n"
            f"  Class: {', '.join(course['class_days'])} {course['class_time']} · {course['room']}"
            + (f" · {course['instructor']}" if course["instructor"] else "")
        )
        text_lines.append(
            f"  Study: {course['study_day']} {course['study_time']} — {course['focus']}"
        )
        if course["exam"]:
            text_lines.append(f"  Exam checkpoint: {course['exam']['title']} on {course['exam']['date']}")
    text_lines.extend(
        [
            "",
            "WHAT NEEDS YOU",
        ]
    )
    for item in notifications:
        if item["kind"] in {"clash", "unparsed", "approval"}:
            text_lines.append(f"- {item['title']}: {item['body']}")
    text_lines.extend(
        [
            "",
            "HOW THE STUDY PLAN WORKS",
            plan["methodology"],
            "",
            "Nothing is written to your calendar without your approval.",
            "— ClashFree study agent",
        ]
    )

    rows_html = []
    for course in courses:
        exam = (
            f"<p style='{SMALL_STYLE};color:#8f5a10'><strong>Exam:</strong> "
            f"{html_lib.escape(course['exam']['title'])} on {html_lib.escape(str(course['exam']['date']))}</p>"
            if course["exam"]
            else ""
        )
        rows_html.append(
            "<tr>"
            f"<td style='padding:12px 10px;border-top:1px solid #e9eee9;vertical-align:top'>"
            f"<strong style='color:#0d1411'>{html_lib.escape(course['course_code'])}</strong><br>"
            f"<span style='{SMALL_STYLE}'>{html_lib.escape(course['title'])}</span></td>"
            f"<td style='padding:12px 10px;border-top:1px solid #e9eee9;vertical-align:top;{SMALL_STYLE}'>"
            f"{html_lib.escape(', '.join(course['class_days']))} · {html_lib.escape(course['class_time'])}<br>"
            f"{html_lib.escape(course['room'])}</td>"
            f"<td style='padding:12px 10px;border-top:1px solid #e9eee9;vertical-align:top;{SMALL_STYLE}'>"
            f"<strong style='color:#0d1411'>{html_lib.escape(course['study_day'])} "
            f"{html_lib.escape(course['study_time'])}</strong><br>{html_lib.escape(course['focus'])}</td>"
            f"<td style='padding:12px 10px;border-top:1px solid #e9eee9;vertical-align:top'>{exam}</td>"
            "</tr>"
        )

    actions_html = "".join(
        "<li style='margin:0 0 8px 0;color:#38463f;font-size:13px;line-height:21px'>"
        f"<strong>{html_lib.escape(item['title'])}</strong><br>{html_lib.escape(item['body'])}</li>"
        for item in notifications
        if item["kind"] in {"clash", "unparsed", "approval"}
    ) or "<li style='color:#38463f;font-size:13px'>Nothing blocked. You are ready to sync.</li>"

    html = f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f2;font-family:Segoe UI,Arial,sans-serif;color:#0d1411">
<div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e3e9e2;border-radius:20px;overflow:hidden">
  <div style="background:#0d1411;padding:28px 28px 24px 28px">
    <p style="margin:0;color:#c7f06a;font-size:11px;letter-spacing:2px;text-transform:uppercase">ClashFree study agent</p>
    <h1 style="margin:8px 0 6px 0;color:#ffffff;font-size:24px;line-height:32px">Your weekly digest</h1>
    <p style="margin:0;color:rgba(255,255,255,.65);font-size:13px">{html_lib.escape(term)} · {html_lib.escape(institution)}</p>
  </div>
  <div style="padding:26px 28px">
    <p style="{PT_STYLE}">Hii buddy,</p>
    <p style="{PT_STYLE}">Here is the class and study digest the agent built from your uploaded timetable.</p>
    <div style="margin:18px 0;padding:14px 16px;background:#f2f7e4;border:1px solid #d6ed9c;border-radius:12px">
      <p style="{SMALL_STYLE};color:#4b6c1c"><strong>{html_lib.escape(plan['summary']['coverage'])}</strong> · {plan['summary']['hours']} focused study hours this week · {plan['summary']['excludedDates']} holiday/reading-week dates excluded</p>
    </div>
    <h2 style="margin:22px 0 10px 0;font-size:16px;color:#0d1411">Classes and study slots</h2>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr>
        <th align="left" style="padding:6px 10px;color:#61756a;font-size:10px;letter-spacing:1px;text-transform:uppercase">Subject</th>
        <th align="left" style="padding:6px 10px;color:#61756a;font-size:10px;letter-spacing:1px;text-transform:uppercase">Class</th>
        <th align="left" style="padding:6px 10px;color:#61756a;font-size:10px;letter-spacing:1px;text-transform:uppercase">Study block</th>
        <th align="left" style="padding:6px 10px;color:#61756a;font-size:10px;letter-spacing:1px;text-transform:uppercase">Checkpoint</th>
      </tr></thead>
      <tbody>{''.join(rows_html)}</tbody>
    </table>
    <h2 style="margin:26px 0 10px 0;font-size:16px;color:#0d1411">What needs you</h2>
    <ul style="margin:0;padding-left:18px">{actions_html}</ul>
    <h2 style="margin:26px 0 10px 0;font-size:16px;color:#0d1411">How the study plan works</h2>
    <p style="{SMALL_STYLE}">{html_lib.escape(plan['methodology'])}</p>
    <p style="margin:20px 0 0 0;color:#61756a;font-size:12px;line-height:19px">Nothing is written to your calendar without your approval.</p>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #e9eee9;background:#fafbf7">
    <p style="margin:0;color:#61756a;font-size:11px">Sent by ClashFree · schedule integrity on every row</p>
  </div>
</div>
</body></html>"""

    return {
        "subject": subject,
        "to": NOTIFICATIONS_TO,
        "from": NOTIFICATIONS_FROM,
        "generatedAt": utc_now(),
        "term": term,
        "institution": institution,
        "text": "\n".join(text_lines),
        "html": html,
        "courseCount": len(courses),
        "blockCount": block_count,
        "notificationCount": len(notifications),
    }


def render_eml(email: dict[str, Any]) -> bytes:
    message = EmailMessage()
    message["Subject"] = email["subject"]
    message["From"] = email["from"]
    message["To"] = email["to"]
    message["Date"] = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S %z")
    message["X-ClashFree-Digest"] = "study-agent"
    message.set_content(email["text"])
    message.add_alternative(email["html"], subtype="html")
    return message.as_bytes()


def send_email_digest(to: str | None = None) -> dict[str, Any]:
    payload = build_notifications()["email"]
    if to:
        payload = {**payload, "to": to}
    sent_at = utc_now()
    if SMTP_HOST:
        message = EmailMessage()
        message["Subject"] = payload["subject"]
        message["From"] = payload["from"]
        message["To"] = payload["to"]
        message.set_content(payload["text"])
        message.add_alternative(payload["html"], subtype="html")
        try:
            if SMTP_USE_SSL:
                with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ssl.create_default_context()) as server:
                    if SMTP_USER:
                        server.login(SMTP_USER, SMTP_PASSWORD)
                    server.send_message(message)
            else:
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                    if SMTP_STARTTLS:
                        server.starttls(context=ssl.create_default_context())
                    if SMTP_USER:
                        server.login(SMTP_USER, SMTP_PASSWORD)
                    server.send_message(message)
        except Exception as exc:  # pragma: no cover - depends on external SMTP
            return {
                "status": "failed",
                "delivery": "smtp",
                "to": payload["to"],
                "subject": payload["subject"],
                "sentAt": sent_at,
                "message": f"SMTP delivery failed: {exc}",
            }
        return {
            "status": "sent",
            "delivery": "smtp",
            "to": payload["to"],
            "subject": payload["subject"],
            "sentAt": sent_at,
            "message": f"Digest emailed to {payload['to']}.",
        }

    OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    filename = f"clashfree-digest-{stamp}.eml"
    path = OUTBOX_DIR / filename
    path.write_bytes(render_eml(payload))
    return {
        "status": "queued",
        "delivery": "outbox",
        "to": payload["to"],
        "subject": payload["subject"],
        "sentAt": sent_at,
        "file": filename,
        "message": (
            "SMTP is not configured, so the digest was written to the local outbox. "
            f"Download {filename} or set SMTP_HOST to deliver it."
        ),
    }

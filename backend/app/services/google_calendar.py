from __future__ import annotations

import json
import secrets
from datetime import date, datetime, timedelta
from typing import Any

from ..config import (
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_TOKEN_PATH,
)
from ..database import get_db, get_settings, update_settings
from ..utils import utc_now
from .calendar_export import approved_events, mark_synced

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
DAY_INDEX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
DAY_CODES = {"Mon": "MO", "Tue": "TU", "Wed": "WE", "Thu": "TH", "Fri": "FR", "Sat": "SA", "Sun": "SU"}


def _client_config() -> dict[str, Any]:
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }


def is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def is_connected() -> bool:
    return GOOGLE_TOKEN_PATH.exists()


def status() -> dict[str, Any]:
    account = None
    token_valid = False
    if is_connected():
        try:
            payload = json.loads(GOOGLE_TOKEN_PATH.read_text(encoding="utf-8"))
            account = payload.get("account") or payload.get("client_id")
            token_valid = bool(payload.get("refresh_token") or payload.get("token"))
        except (OSError, ValueError):
            token_valid = False
    configured = is_configured()
    return {
        "configured": configured,
        "connected": configured and is_connected() and token_valid,
        "account": account,
        "missing": [] if configured else ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
        "redirectUri": GOOGLE_REDIRECT_URI,
        "provider": "Google Calendar",
    }


def auth_url() -> str:
    if not is_configured():
        raise ValueError(
            "Google Calendar is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env."
        )
    try:
        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)
        state = secrets.token_urlsafe(24)
        update_settings({"googleOAuthState": state})
        url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        return url
    except Exception as exc:
        raise ValueError(f"Could not start Google OAuth: {exc}") from exc


def handle_callback(code: str, state: str) -> str:
    settings = get_settings()
    expected = settings.get("googleOAuthState")
    if not expected or state != expected:
        raise ValueError("OAuth state mismatch. Please start the connection again.")
    try:
        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)
        flow.fetch_token(code=code)
        credentials = flow.credentials
        payload = json.loads(credentials.to_json())
        payload["created_at"] = utc_now()
        GOOGLE_TOKEN_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        update_settings({"googleOAuthState": ""})
        return f"{FRONTEND_URL}/integrations?google=connected"
    except Exception as exc:
        return f"{FRONTEND_URL}/integrations?google=error&message={str(exc)[:180]}"


def _credentials():
    if not is_connected():
        raise ValueError("Google Calendar is not connected yet.")
    try:
        from google.oauth2.credentials import Credentials

        return Credentials.from_authorized_user_file(str(GOOGLE_TOKEN_PATH), SCOPES)
    except Exception as exc:
        raise ValueError(f"Stored Google credentials are invalid: {exc}") from exc


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


def _google_body(event: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any] | None:
    timezone = settings.get("timezone") or "Asia/Kolkata"
    term_start = datetime.strptime(settings.get("termStart", "2026-08-24"), "%Y-%m-%d").date()
    term_end = datetime.strptime(settings.get("termEnd", "2026-12-18"), "%Y-%m-%d").date()
    start_time = event.get("start_time") or "09:00"
    end_time = event.get("end_time") or "10:00"
    body: dict[str, Any] = {
        "summary": f"{event.get('course_code') + ' · ' if event.get('course_code') else ''}{event.get('title', 'Class')}",
        "location": event.get("room") or "",
        "description": (
            f"Imported by ClashFree · {event.get('event_type', 'lecture')}\n"
            f"Section: {event.get('section') or '—'}\n"
            f"Instructor: {event.get('instructor') or '—'}\n"
            f"Trace: {event.get('trace_id', '—')}"
        ),
        "extendedProperties": {
            "private": {
                "clashfreeEventId": event["id"],
                "clashfreeTraceId": event.get("trace_id") or "",
                "clashfreeSourceId": event.get("source_id") or "",
            }
        },
        "reminders": {"useDefault": True},
        "colorId": "9" if event.get("is_core") else "7",
    }
    event_date = event.get("event_date")
    if event_date:
        start_date = event_date[:10]
        end_dt = datetime.strptime(f"{start_date} {end_time}", "%Y-%m-%d %H:%M") + timedelta(minutes=0)
        body["start"] = {"dateTime": f"{start_date}T{start_time}:00", "timeZone": timezone}
        body["end"] = {"dateTime": end_dt.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": timezone}
        return body

    days = event.get("days") or []
    first = _first_occurrence(days, term_start, term_end)
    if not first:
        return None
    byday = ",".join(DAY_CODES[day] for day in days if day in DAY_CODES)
    body["start"] = {"dateTime": f"{first.isoformat()}T{start_time}:00", "timeZone": timezone}
    body["end"] = {"dateTime": f"{first.isoformat()}T{end_time}:00", "timeZone": timezone}
    body["recurrence"] = [f"RRULE:FREQ=WEEKLY;BYDAY={byday};UNTIL={term_end.strftime('%Y%m%d')}T235959Z"]
    return body


def sync_to_google() -> dict[str, Any]:
    if not is_configured():
        raise ValueError("Google Calendar OAuth is not configured. Use the .ics export or add API credentials.")
    events = approved_events()
    if not events:
        raise ValueError("Approve at least one event before syncing.")
    try:
        from googleapiclient.discovery import build

        service = build("calendar", "v3", credentials=_credentials(), cache_discovery=False)
        settings = get_settings()
        created = 0
        updated = 0
        skipped = 0
        synced_ids: list[str] = []
        for event in events:
            body = _google_body(event, settings)
            if not body:
                skipped += 1
                continue
            existing = (
                service.events()
                .list(
                    calendarId="primary",
                    privateExtendedProperty=f"clashfreeEventId={event['id']}",
                    maxResults=1,
                    singleEvents=False,
                )
                .execute()
                .get("items", [])
            )
            if existing:
                service.events().patch(
                    calendarId="primary", eventId=existing[0]["id"], body=body
                ).execute()
                updated += 1
            else:
                service.events().insert(calendarId="primary", body=body).execute()
                created += 1
            synced_ids.append(event["id"])
        mark_synced(synced_ids, "Google Calendar")
        return {
            "status": "success",
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "synced": len(synced_ids),
            "message": f"Synced {len(synced_ids)} events ({created} new, {updated} updated).",
        }
    except Exception as exc:
        from .calendar_export import record_sync

        record_sync("Google Calendar", "failed", 0, str(exc)[:500])
        raise ValueError(f"Google Calendar sync failed: {exc}") from exc

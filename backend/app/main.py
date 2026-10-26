from __future__ import annotations

import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field

from .config import FRONTEND_DIST, FRONTEND_URL, OPENAI_API_KEY, OPENAI_MODEL, UPLOAD_DIR
from .database import get_settings, init_db, update_settings
from .services import google_calendar
from .services.calendar_export import (
    approved_events,
    build_ics,
    record_sync,
    sync_preview,
)
from .services.extractor import sample_timetable
from .services.ingestion import fetch_url, read_upload
from .services.notifications import build_notifications, render_eml, send_email_digest
from .services.study_plan import build_study_ics, generate_study_plan
from .services.pipeline import (
    approve_events,
    dashboard,
    delete_source,
    delete_unparsed,
    get_event,
    get_run,
    get_source,
    list_clashes,
    list_events,
    list_runs,
    list_sources,
    list_unparsed,
    manual_parse_unparsed,
    process_source,
    reset_demo,
    resolve_clash,
    set_event_approval,
    update_event,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    from .services.pipeline import seed_demo

    seed_demo()
    yield


app = FastAPI(
    title="ClashFree API",
    description="Schedule intelligence agent for students. Ingest, verify, detect clashes, and sync.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class URLIngestRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)


class ApprovalRequest(BaseModel):
    event_ids: list[str] | None = None
    approve_all: bool = False


class EventUpdateRequest(BaseModel):
    title: str | None = None
    course_code: str | None = None
    section: str | None = None
    event_type: str | None = None
    days: list[str] | None = None
    start_time: str | None = None
    end_time: str | None = None
    event_date: str | None = None
    room: str | None = None
    instructor: str | None = None
    is_core: bool | None = None


class ClashResolutionRequest(BaseModel):
    action: Literal["keep_a", "keep_b", "keep_both", "ignore"]
    chosen_event_id: str | None = None


class UnparsedResolveRequest(BaseModel):
    title: str = Field(min_length=1)
    course_code: str = ""
    event_type: str = "lecture"
    days: list[str] = []
    start_time: str = "09:00"
    end_time: str = "10:00"
    event_date: str | None = None
    room: str = ""
    section: str = ""
    instructor: str = ""
    is_core: bool = False


class SettingsRequest(BaseModel):
    institution: str | None = None
    termName: str | None = None
    termStart: str | None = None
    termEnd: str | None = None
    readingWeekStart: str | None = None
    readingWeekEnd: str | None = None
    timezone: str | None = None
    holidays: list[dict[str, str]] | None = None


class DigestEmailRequest(BaseModel):
    to: str | None = Field(default=None, max_length=320)


def _processing_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "agent": "ClashFree",
        "version": "1.0.0",
        "capabilities": {
            "deterministicParser": True,
            "multimodalAI": bool(OPENAI_API_KEY),
            "model": OPENAI_MODEL if OPENAI_API_KEY else None,
            "googleCalendar": google_calendar.is_configured(),
            "icsExport": True,
            "studyAgent": True,
            "emailDigest": True,
        },
    }


@app.get("/api/agent/status")
def agent_status() -> dict[str, Any]:
    settings = get_settings()
    return {
        "name": "ClashFree",
        "role": "Academic schedule integrity agent",
        "engine": "OpenAI multimodal" if OPENAI_API_KEY else "Deterministic extraction",
        "model": OPENAI_MODEL if OPENAI_API_KEY else "local-rules-v1",
        "term": settings.get("termName"),
        "stages": [
            {"id": "ingest", "label": "Scrape or ingest", "detail": "Trace ID mapped to every source"},
            {"id": "normalize", "label": "Normalize & read", "detail": "Courses, times, rooms, sections"},
            {"id": "check", "label": "Clash check", "detail": "Core vs elective + calendar slots"},
            {"id": "partition", "label": "Partition outcomes", "detail": "Verified, clashes, unparsed"},
            {"id": "approve", "label": "Human approval", "detail": "Approve before any write"},
            {"id": "sync", "label": "Final sync", "detail": "ICS or Google Calendar"},
        ],
    }


@app.get("/api/dashboard")
def get_dashboard() -> dict[str, Any]:
    data = dashboard()
    data["agent"] = agent_status()
    data["google"] = google_calendar.status()
    data["sync"] = sync_preview()
    return data


@app.get("/api/sources")
def sources() -> dict[str, Any]:
    return {"sources": list_sources()}


@app.get("/api/sources/{source_id}")
def source_detail(source_id: str) -> dict[str, Any]:
    source = get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found.")
    source.pop("raw_text", None)
    return {
        "source": source,
        "events": list_events(source_id=source_id),
        "unparsed": [row for row in list_unparsed() if row["source_id"] == source_id],
        "runs": [run for run in list_runs(50) if run["source_id"] == source_id],
    }


@app.post("/api/sources/upload")
async def upload_source(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    try:
        record = read_upload(file.filename or "upload", content)
        from .services.pipeline import create_source

        create_source(record)
        stats = process_source(record["id"])
        source = get_source(record["id"])
    except Exception as exc:
        raise _processing_error(exc) from exc
    source.pop("raw_text", None) if source else None
    return {"source": source, "run": get_run(stats["runId"]), "stats": stats}


@app.post("/api/sources/url")
def ingest_url(payload: URLIngestRequest) -> dict[str, Any]:
    try:
        record = fetch_url(payload.url.strip())
        from .services.pipeline import create_source

        create_source(record)
        stats = process_source(record["id"])
        source = get_source(record["id"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not ingest URL: {exc}") from exc
    if source:
        source.pop("raw_text", None)
    return {"source": source, "run": get_run(stats["runId"]), "stats": stats}


@app.post("/api/sources/{source_id}/reprocess")
def reprocess_source(source_id: str) -> dict[str, Any]:
    try:
        stats = process_source(source_id)
        source = get_source(source_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise _processing_error(exc) from exc
    if source:
        source.pop("raw_text", None)
    return {"source": source, "run": get_run(stats["runId"]), "stats": stats}


@app.delete("/api/sources/{source_id}")
def remove_source(source_id: str) -> dict[str, Any]:
    if not delete_source(source_id):
        raise HTTPException(status_code=404, detail="Source not found.")
    return {"ok": True}


@app.get("/api/runs")
def runs(limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    return {"runs": list_runs(limit)}


@app.get("/api/runs/{run_id}")
def run_detail(run_id: str) -> dict[str, Any]:
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@app.get("/api/events")
def events(
    source_id: str | None = None,
    status: str | None = None,
    approved: bool | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    return {"events": list_events(source_id=source_id, status=status, approved=approved, search=search)}


@app.get("/api/events/{event_id}")
def event_detail(event_id: str) -> dict[str, Any]:
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


@app.patch("/api/events/{event_id}")
def edit_event(event_id: str, payload: EventUpdateRequest) -> dict[str, Any]:
    event = update_event(event_id, payload.model_dump(exclude_unset=True))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


@app.post("/api/events/{event_id}/approval")
def approve_one(event_id: str, approved: bool = True) -> dict[str, Any]:
    event = set_event_approval(event_id, approved)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


@app.post("/api/approvals")
def approve(payload: ApprovalRequest) -> dict[str, Any]:
    result = approve_events(payload.event_ids, payload.approve_all)
    return {**result, "sync": sync_preview()}


@app.get("/api/clashes")
def clashes(include_resolved: bool = False) -> dict[str, Any]:
    return {"clashes": list_clashes(include_resolved=include_resolved)}


@app.patch("/api/clashes/{clash_id}")
def resolve(clash_id: str, payload: ClashResolutionRequest) -> dict[str, Any]:
    try:
        clash = resolve_clash(clash_id, payload.action, payload.chosen_event_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not clash:
        raise HTTPException(status_code=404, detail="Clash not found.")
    return clash


@app.get("/api/unparsed")
def unparsed() -> dict[str, Any]:
    return {"rows": list_unparsed()}


@app.post("/api/unparsed/{row_id}/resolve")
def resolve_unparsed(row_id: str, payload: UnparsedResolveRequest) -> dict[str, Any]:
    event = manual_parse_unparsed(row_id, payload.model_dump())
    if not event:
        raise HTTPException(status_code=404, detail="Unparsed row not found.")
    return event


@app.delete("/api/unparsed/{row_id}")
def remove_unparsed(row_id: str) -> dict[str, Any]:
    if not delete_unparsed(row_id):
        raise HTTPException(status_code=404, detail="Unparsed row not found.")
    return {"ok": True}


@app.get("/api/sync/preview")
def preview() -> dict[str, Any]:
    return sync_preview()


@app.get("/api/sync/ics")
def download_ics() -> Response:
    events_to_sync = approved_events()
    if not events_to_sync:
        raise HTTPException(
            status_code=400,
            detail="No approved events. Review and approve the schedule before exporting.",
        )
    payload = build_ics(events_to_sync)
    term = re.sub(r"[^A-Za-z0-9]+", "-", get_settings().get("termName", "term")).strip("-").lower()
    record_sync("ICS", "success", len(events_to_sync), "Generated an RFC 5545 calendar export.")
    from .services.calendar_export import mark_synced

    mark_synced([event["id"] for event in events_to_sync], "ICS")
    return Response(
        content=payload,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="clashfree-{term or "schedule"}.ics"',
            "X-ClashFree-Events": str(len(events_to_sync)),
        },
    )


@app.get("/api/study-plan")
def study_plan() -> dict[str, Any]:
    return generate_study_plan()


@app.get("/api/study-plan/ics")
def study_plan_ics() -> Response:
    plan = generate_study_plan()
    if not plan["blocks"]:
        raise HTTPException(
            status_code=400,
            detail="No courses found yet. Upload a timetable before exporting a study plan.",
        )
    payload = build_study_ics(plan)
    term = re.sub(r"[^A-Za-z0-9]+", "-", get_settings().get("termName", "term")).strip("-").lower()
    return Response(
        content=payload,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="clashfree-study-{term or "plan"}.ics"',
            "X-ClashFree-Study-Blocks": str(len(plan["blocks"])),
        },
    )


@app.get("/api/notifications")
def notifications() -> dict[str, Any]:
    return build_notifications()


@app.get("/api/notifications/email")
def notification_email() -> dict[str, Any]:
    return build_notifications()["email"]


@app.post("/api/notifications/email/send")
def send_notification_email(payload: DigestEmailRequest | None = None) -> dict[str, Any]:
    return send_email_digest(payload.to if payload else None)


@app.get("/api/notifications/email/download")
def download_notification_email() -> Response:
    email = build_notifications()["email"]
    return Response(
        content=render_eml(email),
        media_type="message/rfc822",
        headers={"Content-Disposition": 'attachment; filename="clashfree-digest.eml"'},
    )


@app.get("/api/integrations/google/status")
def google_status() -> dict[str, Any]:
    return google_calendar.status()


@app.get("/api/integrations/google/auth-url")
def google_auth_url() -> dict[str, Any]:
    try:
        return {"url": google_calendar.auth_url()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/integrations/google/callback")
def google_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        return RedirectResponse(
            f"{FRONTEND_URL}/integrations?google=error&message={error[:180]}"
        )
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code or state.")
    redirect = google_calendar.handle_callback(code, state)
    return RedirectResponse(redirect)


@app.post("/api/integrations/google/sync")
def google_sync() -> dict[str, Any]:
    try:
        return google_calendar.sync_to_google()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/settings")
def settings() -> dict[str, Any]:
    return get_settings()


@app.put("/api/settings")
def save_settings(payload: SettingsRequest) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return get_settings()
    allowed = {
        "institution",
        "termName",
        "termStart",
        "termEnd",
        "readingWeekStart",
        "readingWeekEnd",
        "timezone",
        "holidays",
    }
    return update_settings({key: value for key, value in values.items() if key in allowed})


@app.get("/api/sample")
def sample() -> Response:
    return Response(
        content=sample_timetable(),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="clashfree-sample-timetable.txt"'},
    )


@app.post("/api/demo/reset")
def demo_reset() -> dict[str, Any]:
    source_id = reset_demo()
    return {"ok": True, "sourceId": source_id, "dashboard": dashboard()}


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


if FRONTEND_DIST.exists():
    from fastapi.staticfiles import StaticFiles

    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")

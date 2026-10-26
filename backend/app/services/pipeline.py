from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from ..database import get_db, get_settings
from ..utils import compact, new_id, trace_id, utc_now
from .extractor import (
    events_fingerprint,
    extract_schedule,
    identity_key,
    sample_timetable,
)

DAY_INDEX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
DAY_FROM_DATE = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}


def create_source(record: dict[str, Any], status: str = "queued") -> dict[str, Any]:
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO sources
              (id, name, kind, location, status, trace_id, raw_text, content_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["id"],
                record["name"],
                record["kind"],
                record.get("location", ""),
                status,
                record["trace_id"],
                record.get("raw_text", ""),
                record.get("content_hash", ""),
                record["created_at"],
                record["created_at"],
            ),
        )
    return record


def get_source(source_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
    return dict(row) if row else None


def list_sources() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT s.*,
              (SELECT COUNT(*) FROM events e WHERE e.source_id = s.id AND e.status != 'ignored') AS event_count,
              (SELECT COUNT(*) FROM unparsed_rows u WHERE u.source_id = s.id) AS unparsed_count,
              (SELECT COUNT(*) FROM runs r WHERE r.source_id = s.id) AS run_count,
              (SELECT r.stats FROM runs r WHERE r.source_id = s.id ORDER BY r.started_at DESC LIMIT 1) AS last_stats
            FROM sources s
            ORDER BY s.created_at DESC
            """
        ).fetchall()
    output = []
    for row in rows:
        item = dict(row)
        item.pop("raw_text", None)
        item["last_stats"] = json.loads(item["last_stats"]) if item.get("last_stats") else None
        output.append(item)
    return output


def get_run(run_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    if not row:
        return None
    item = dict(row)
    item["stats"] = json.loads(item["stats"]) if item.get("stats") else None
    return item


def list_runs(limit: int = 20) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT r.*, s.name AS source_name
            FROM runs r JOIN sources s ON s.id = r.source_id
            ORDER BY r.started_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    output = []
    for row in rows:
        item = dict(row)
        item["stats"] = json.loads(item["stats"]) if item.get("stats") else None
        output.append(item)
    return output


def process_source(
    source_id: str,
    force_fallback: bool = False,
    run_id: str | None = None,
) -> dict[str, Any]:
    source = get_source(source_id)
    if not source:
        raise ValueError("Source not found.")

    run_id = run_id or new_id("run")
    run_trace = trace_id()
    started = utc_now()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO runs (id, source_id, trace_id, status, stage, started_at)
            VALUES (?, ?, ?, 'running', 'reading', ?)
            """,
            (run_id, source_id, run_trace, started),
        )
        conn.execute(
            "UPDATE sources SET status = 'processing', updated_at = ? WHERE id = ?",
            (started, source_id),
        )

    image_path = Path(source["location"]) if source.get("location") and Path(source["location"]).is_file() else None
    if image_path and image_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}:
        image_path = None

    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE runs SET stage = 'extracting', engine = ? WHERE id = ?",
                ("deterministic" if force_fallback else "auto", run_id),
            )
        extraction = extract_schedule(
            source.get("raw_text") or "",
            filename=source.get("name") or "",
            image_path=image_path,
            force_fallback=force_fallback,
        )
        events = extraction.get("events") or []
        unparsed = list(extraction.get("unparsed") or [])
        engine = extraction.get("engine") or "deterministic"

        # Confidence gate: never guess at an illegible row.
        trusted = []
        for event in events:
            confidence = float(event.get("confidence") or 0)
            if confidence < 0.45:
                reason = (
                    f"Legibility confidence {confidence:.0%} is below the 45% safety threshold."
                )
            elif not (event.get("days") or event.get("event_date")):
                reason = "No class day or exam date could be established from this row."
            elif not (event.get("start_time") and event.get("end_time")):
                reason = "Start or end time is missing or illegible, so the row cannot be scheduled."
            else:
                trusted.append(event)
                continue
            unparsed.append(
                {
                    "raw_text": event.get("raw_text") or f"{event.get('course_code')} {event.get('title')}",
                    "reason": reason,
                    "confidence": confidence,
                    "source_row": event.get("source_row") or 0,
                }
            )

        stats = _persist_extraction(source, run_id, run_trace, trusted, unparsed, engine)
        clash_count = recompute_clashes()
        stats["clashes"] = clash_count
        stats["engine"] = engine
        stats["traceId"] = run_trace
        stats["sourceName"] = source["name"]
        stats["sourceKind"] = source["kind"]
        finished = utc_now()

        status = "review" if (unparsed or clash_count) else "ready"
        with get_db() as conn:
            conn.execute(
                """
                UPDATE runs SET status = 'complete', stage = 'ready', finished_at = ?, stats = ?
                WHERE id = ?
                """,
                (finished, json.dumps(stats, ensure_ascii=False), run_id),
            )
            conn.execute(
                "UPDATE sources SET status = ?, updated_at = ? WHERE id = ?",
                (status, finished, source_id),
            )
        stats["status"] = "complete"
        stats["runId"] = run_id
        return stats
    except Exception as exc:
        finished = utc_now()
        with get_db() as conn:
            conn.execute(
                "UPDATE runs SET status = 'failed', stage = 'failed', finished_at = ?, error = ? WHERE id = ?",
                (finished, str(exc), run_id),
            )
            conn.execute(
                "UPDATE sources SET status = 'error', updated_at = ? WHERE id = ?",
                (finished, source_id),
            )
        raise


def _persist_extraction(
    source: dict[str, Any],
    run_id: str,
    run_trace: str,
    events: list[dict[str, Any]],
    unparsed: list[dict[str, Any]],
    engine: str,
) -> dict[str, Any]:
    now = utc_now()
    new_count = 0
    updated_count = 0
    unchanged_count = 0
    removed_count = 0
    changes: list[dict[str, Any]] = []
    seen_ids: list[str] = []
    used_keys: dict[str, int] = {}

    with get_db() as conn:
        existing_rows = conn.execute(
            "SELECT * FROM events WHERE source_id = ?", (source["id"],)
        ).fetchall()
        existing = {row["identity_key"]: dict(row) for row in existing_rows}

        for raw_event in events:
            event = dict(raw_event)
            key = identity_key(event)
            used_keys[key] = used_keys.get(key, 0) + 1
            if used_keys[key] > 1:
                key = f"{key}#{used_keys[key]}"
            fingerprint = events_fingerprint(event)
            evidence = json.dumps(
                {
                    "sourceId": source["id"],
                    "sourceName": source["name"],
                    "location": source.get("location"),
                    "row": event.get("source_row"),
                    "raw": compact(event.get("raw_text"), 700),
                    "engine": engine,
                },
                ensure_ascii=False,
            )
            prior = existing.get(key)
            days = event.get("days") or []
            if event.get("event_date"):
                try:
                    weekday = datetime.strptime(event["event_date"], "%Y-%m-%d").weekday()
                    if not days:
                        days = [DAY_FROM_DATE[weekday]]
                except ValueError:
                    pass

            if prior and prior["fingerprint"] == fingerprint:
                unchanged_count += 1
                seen_ids.append(prior["id"])
                conn.execute(
                    """
                    UPDATE events SET confidence = ?, trace_id = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (event.get("confidence", 0.8), prior["trace_id"], now, prior["id"]),
                )
                continue

            if prior:
                updated_count += 1
                changed = _changed_fields(prior, event)
                conn.execute(
                    """
                    UPDATE events SET
                      title = ?, course_code = ?, section = ?, event_type = ?, days = ?,
                      start_time = ?, end_time = ?, event_date = ?, room = ?, instructor = ?,
                      is_core = ?, confidence = ?, status = ?, source_row = ?, raw_text = ?,
                      evidence = ?, trace_id = ?, fingerprint = ?, approved = 0, synced = 0, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        event.get("title") or "Untitled course",
                        event.get("course_code") or "",
                        event.get("section") or "",
                        event.get("event_type") or "lecture",
                        json.dumps(days),
                        event.get("start_time"),
                        event.get("end_time"),
                        event.get("event_date"),
                        event.get("room") or "",
                        event.get("instructor") or "",
                        1 if event.get("is_core") else 0,
                        float(event.get("confidence") or 0.8),
                        "verified" if float(event.get("confidence") or 0) >= 0.65 else "review",
                        event.get("source_row"),
                        compact(event.get("raw_text"), 2000),
                        evidence,
                        run_trace,
                        fingerprint,
                        now,
                        prior["id"],
                    ),
                )
                seen_ids.append(prior["id"])
                changes.append(
                    {
                        "type": "updated",
                        "title": event.get("title"),
                        "fields": changed,
                        "eventId": prior["id"],
                    }
                )
            else:
                new_count += 1
                event_id = new_id("evt")
                conn.execute(
                    """
                    INSERT INTO events
                      (id, source_id, run_id, identity_key, title, course_code, section, event_type,
                       days, start_time, end_time, event_date, room, instructor, is_core, confidence,
                       status, source_row, raw_text, evidence, trace_id, fingerprint, approved, synced,
                       created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
                    """,
                    (
                        event_id,
                        source["id"],
                        run_id,
                        key,
                        event.get("title") or "Untitled course",
                        event.get("course_code") or "",
                        event.get("section") or "",
                        event.get("event_type") or "lecture",
                        json.dumps(days),
                        event.get("start_time"),
                        event.get("end_time"),
                        event.get("event_date"),
                        event.get("room") or "",
                        event.get("instructor") or "",
                        1 if event.get("is_core") else 0,
                        float(event.get("confidence") or 0.8),
                        "verified" if float(event.get("confidence") or 0) >= 0.65 else "review",
                        event.get("source_row"),
                        compact(event.get("raw_text"), 2000),
                        evidence,
                        run_trace,
                        fingerprint,
                        now,
                        now,
                    ),
                )
                seen_ids.append(event_id)
                changes.append(
                    {
                        "type": "new",
                        "title": event.get("title"),
                        "fields": ["course", "time", "room"],
                        "eventId": event_id,
                    }
                )

        if events:
            stale = [row for key, row in existing.items() if row["id"] not in seen_ids]
            for row in stale:
                removed_count += 1
                changes.append({"type": "removed", "title": row["title"], "fields": ["removed"], "eventId": row["id"]})
                conn.execute("DELETE FROM events WHERE id = ?", (row["id"],))

        conn.execute("DELETE FROM unparsed_rows WHERE source_id = ?", (source["id"],))
        for row in unparsed:
            conn.execute(
                """
                INSERT INTO unparsed_rows
                  (id, source_id, run_id, raw_text, reason, confidence, source_row, page, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id("unp"),
                    source["id"],
                    run_id,
                    row.get("raw_text") or "[empty row]",
                    row.get("reason") or "Could not parse row",
                    float(row.get("confidence") or 0),
                    int(row.get("source_row") or 0),
                    row.get("page"),
                    now,
                ),
            )

    return {
        "new": new_count,
        "updated": updated_count,
        "unchanged": unchanged_count,
        "removed": removed_count,
        "parsed": len(events),
        "unparsed": len(unparsed),
        "changes": changes[:40],
    }


def _changed_fields(prior: dict[str, Any], event: dict[str, Any]) -> list[str]:
    fields = []
    mappings = {
        "title": "title",
        "course_code": "course_code",
        "event_type": "type",
        "start_time": "start",
        "end_time": "end",
        "event_date": "date",
        "room": "room",
        "section": "section",
        "instructor": "instructor",
    }
    for db_key, label in mappings.items():
        if str(prior.get(db_key) or "") != str(event.get(db_key) or ""):
            fields.append(label)
    try:
        prior_days = json.loads(prior.get("days") or "[]")
    except ValueError:
        prior_days = []
    if prior_days != (event.get("days") or []):
        fields.append("days")
    if bool(prior.get("is_core")) != bool(event.get("is_core")):
        fields.append("requirement")
    return fields


def _time_minutes(value: str | None) -> int | None:
    if not value:
        return None
    match = re.match(r"(\d{1,2}):(\d{2})", value)
    if not match:
        return None
    return int(match.group(1)) * 60 + int(match.group(2))


def _event_days(event: dict[str, Any]) -> list[str]:
    try:
        return json.loads(event.get("days") or "[]")
    except (TypeError, ValueError):
        return []


def _shared_occurrence(a: dict[str, Any], b: dict[str, Any]) -> str | None:
    a_date = a.get("event_date")
    b_date = b.get("event_date")
    a_days = _event_days(a)
    b_days = _event_days(b)
    if a_date and b_date:
        return a_date if a_date == b_date else None
    if a_date and b_days:
        try:
            day = DAY_FROM_DATE[datetime.strptime(a_date, "%Y-%m-%d").weekday()]
        except ValueError:
            return None
        return a_date if day in b_days else None
    if b_date and a_days:
        try:
            day = DAY_FROM_DATE[datetime.strptime(b_date, "%Y-%m-%d").weekday()]
        except ValueError:
            return None
        return b_date if day in a_days else None
    shared = sorted(set(a_days) & set(b_days), key=lambda d: DAY_INDEX.get(d, 9))
    return shared[0] if shared else None


def find_overlap(a: dict[str, Any], b: dict[str, Any]) -> tuple[int, str] | None:
    if a["id"] == b["id"]:
        return None
    start_a, end_a = _time_minutes(a.get("start_time")), _time_minutes(a.get("end_time"))
    start_b, end_b = _time_minutes(b.get("start_time")), _time_minutes(b.get("end_time"))
    if None in {start_a, end_a, start_b, end_b}:
        return None
    overlap = min(end_a, end_b) - max(start_a, start_b)
    if overlap <= 0:
        return None
    occurrence = _shared_occurrence(a, b)
    if not occurrence:
        return None
    return overlap, occurrence


def recompute_clashes() -> int:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE status != 'ignored' ORDER BY course_code, start_time"
        ).fetchall()
        existing_rows = conn.execute("SELECT * FROM clashes").fetchall()
    existing = {row["pair_key"]: dict(row) for row in existing_rows}
    events = [dict(row) for row in rows]
    clashes: list[dict[str, Any]] = []
    for index, first in enumerate(events):
        for second in events[index + 1 :]:
            overlap = find_overlap(first, second)
            if not overlap:
                continue
            minutes, occurrence = overlap
            pair_key = "::".join(sorted([first["identity_key"], second["identity_key"]]))
            core_count = int(bool(first["is_core"])) + int(bool(second["is_core"]))
            severity = "high" if core_count else "medium"
            label_a = first.get("course_code") or first["title"]
            label_b = second.get("course_code") or second["title"]
            reason = (
                f"{label_a} ({occurrence} {first.get('start_time')}–{first.get('end_time')}) "
                f"overlaps {label_b} ({occurrence} {second.get('start_time')}–{second.get('end_time')}) "
                f"by {minutes} minutes."
            )
            clashes.append(
                {
                    "pair_key": pair_key,
                    "event_a_id": first["id"],
                    "event_b_id": second["id"],
                    "reason": reason,
                    "overlap_minutes": minutes,
                    "severity": severity,
                    "source_id": first["source_id"],
                }
            )

    now = utc_now()
    current_keys = {clash["pair_key"] for clash in clashes}
    with get_db() as conn:
        if current_keys:
            placeholders = ",".join("?" for _ in current_keys)
            conn.execute(
                f"DELETE FROM clashes WHERE status = 'open' AND pair_key NOT IN ({placeholders})",
                list(current_keys),
            )
        else:
            conn.execute("DELETE FROM clashes WHERE status = 'open'")
        conn.execute(
            """
            DELETE FROM clashes
            WHERE event_a_id NOT IN (SELECT id FROM events)
               OR event_b_id NOT IN (SELECT id FROM events)
            """
        )

        for clash in clashes:
            prior = existing.get(clash["pair_key"])
            if prior:
                conn.execute(
                    """
                    UPDATE clashes SET
                      event_a_id = ?, event_b_id = ?, reason = ?, overlap_minutes = ?,
                      severity = ?, source_id = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        clash["event_a_id"],
                        clash["event_b_id"],
                        clash["reason"],
                        clash["overlap_minutes"],
                        clash["severity"],
                        clash["source_id"],
                        now,
                        prior["id"],
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO clashes
                      (id, run_id, source_id, pair_key, event_a_id, event_b_id, reason, overlap_minutes,
                       severity, status, resolution, created_at, updated_at)
                    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, ?, ?)
                    """,
                    (
                        new_id("clsh"),
                        clash["source_id"],
                        clash["pair_key"],
                        clash["event_a_id"],
                        clash["event_b_id"],
                        clash["reason"],
                        clash["overlap_minutes"],
                        clash["severity"],
                        now,
                        now,
                    ),
                )
        open_count = conn.execute("SELECT COUNT(*) AS n FROM clashes WHERE status = 'open'").fetchone()["n"]
    return open_count


def list_events(
    source_id: str | None = None,
    status: str | None = None,
    approved: bool | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    clauses = []
    params: list[Any] = []
    if source_id:
        clauses.append("e.source_id = ?")
        params.append(source_id)
    if status:
        clauses.append("e.status = ?")
        params.append(status)
    if approved is not None:
        clauses.append("e.approved = ?")
        params.append(1 if approved else 0)
    if not status:
        clauses.append("e.status != 'ignored'")
    if search:
        clauses.append("(e.title LIKE ? OR e.course_code LIKE ? OR e.room LIKE ?)")
        params.extend([f"%{search}%"] * 3)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT e.*, s.name AS source_name, s.location AS source_location
            FROM events e JOIN sources s ON s.id = e.source_id
            {where}
            ORDER BY COALESCE(e.event_date, '9999-12-31'), e.start_time, e.course_code
            """,
            params,
        ).fetchall()
    return [_event_public(row) for row in rows]


def get_event(event_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT e.*, s.name AS source_name, s.location AS source_location
            FROM events e JOIN sources s ON s.id = e.source_id
            WHERE e.id = ?
            """,
            (event_id,),
        ).fetchone()
    return _event_public(row) if row else None


def _event_public(row: Any) -> dict[str, Any]:
    item = dict(row)
    item["days"] = json.loads(item.get("days") or "[]")
    item["is_core"] = bool(item.get("is_core"))
    item["approved"] = bool(item.get("approved"))
    item["synced"] = bool(item.get("synced"))
    evidence = item.get("evidence")
    try:
        item["evidence"] = json.loads(evidence) if evidence else None
    except (TypeError, ValueError):
        item["evidence"] = None
    return item


def list_clashes(include_resolved: bool = False) -> list[dict[str, Any]]:
    clause = "" if include_resolved else "WHERE c.status = 'open'"
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT c.*,
              a.title AS event_a_title, a.course_code AS event_a_code,
              a.start_time AS event_a_start, a.end_time AS event_a_end,
              a.days AS event_a_days, a.room AS event_a_room, a.is_core AS event_a_core,
              b.title AS event_b_title, b.course_code AS event_b_code,
              b.start_time AS event_b_start, b.end_time AS event_b_end,
              b.days AS event_b_days, b.room AS event_b_room, b.is_core AS event_b_core,
              s.name AS source_name
            FROM clashes c
            JOIN events a ON a.id = c.event_a_id
            JOIN events b ON b.id = c.event_b_id
            LEFT JOIN sources s ON s.id = c.source_id
            {clause}
            ORDER BY CASE c.severity WHEN 'high' THEN 0 ELSE 1 END, c.created_at DESC
            """
        ).fetchall()
    return [_clash_public(row) for row in rows]


def get_clash(clash_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT c.*,
              a.title AS event_a_title, a.course_code AS event_a_code,
              a.start_time AS event_a_start, a.end_time AS event_a_end,
              a.days AS event_a_days, a.room AS event_a_room, a.is_core AS event_a_core,
              b.title AS event_b_title, b.course_code AS event_b_code,
              b.start_time AS event_b_start, b.end_time AS event_b_end,
              b.days AS event_b_days, b.room AS event_b_room, b.is_core AS event_b_core,
              s.name AS source_name
            FROM clashes c
            JOIN events a ON a.id = c.event_a_id
            JOIN events b ON b.id = c.event_b_id
            LEFT JOIN sources s ON s.id = c.source_id
            WHERE c.id = ?
            """,
            (clash_id,),
        ).fetchone()
    return _clash_public(row) if row else None


def _clash_public(row: Any) -> dict[str, Any]:
    item = dict(row)
    item["event_a_days"] = json.loads(item.get("event_a_days") or "[]")
    item["event_b_days"] = json.loads(item.get("event_b_days") or "[]")
    item["event_a_core"] = bool(item.get("event_a_core"))
    item["event_b_core"] = bool(item.get("event_b_core"))
    return item


def list_unparsed() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT u.*, s.name AS source_name, s.location AS source_location
            FROM unparsed_rows u JOIN sources s ON s.id = u.source_id
            ORDER BY u.created_at DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def resolve_clash(clash_id: str, action: str, chosen_event_id: str | None = None) -> dict[str, Any] | None:
    if action not in {"keep_a", "keep_b", "keep_both", "ignore"}:
        raise ValueError("Unsupported clash resolution.")
    with get_db() as conn:
        row = conn.execute("SELECT * FROM clashes WHERE id = ?", (clash_id,)).fetchone()
        if not row:
            return None
        event_a_id = row["event_a_id"]
        event_b_id = row["event_b_id"]
        if action == "keep_a":
            chosen_event_id = chosen_event_id or event_a_id
            resolution = f"Keep {chosen_event_id} as the primary commitment"
        elif action == "keep_b":
            chosen_event_id = chosen_event_id or event_b_id
            resolution = f"Keep {chosen_event_id} as the primary commitment"
        elif action == "keep_both":
            resolution = "Acknowledged — keep both commitments"
        else:
            resolution = "Ignored intentionally"

        now = utc_now()
        conn.execute(
            "UPDATE clashes SET status = 'resolved', resolution = ?, updated_at = ? WHERE id = ?",
            (resolution, now, clash_id),
        )

        if action in {"keep_a", "keep_b"} and chosen_event_id:
            other_event_id = event_b_id if chosen_event_id == event_a_id else event_a_id
            conn.execute(
                "UPDATE events SET status = 'verified', approved = 0, synced = 0, updated_at = ? WHERE id = ?",
                (now, chosen_event_id),
            )
            conn.execute(
                "UPDATE events SET status = 'ignored', approved = 0, synced = 0, updated_at = ? WHERE id = ?",
                (now, other_event_id),
            )
        else:
            conn.execute(
                "UPDATE events SET status = 'verified', approved = 0, synced = 0, updated_at = ? WHERE id IN (?, ?)",
                (now, event_a_id, event_b_id),
            )

    return get_clash(clash_id)


def approve_events(event_ids: list[str] | None = None, approve_all: bool = False) -> dict[str, Any]:
    blocked_sql = """
        SELECT event_a_id AS event_id FROM clashes WHERE status = 'open'
        UNION
        SELECT event_b_id AS event_id FROM clashes WHERE status = 'open'
    """
    now = utc_now()
    with get_db() as conn:
        blocked = {
            row["event_id"]
            for row in conn.execute(blocked_sql).fetchall()
        }
        if approve_all or not event_ids:
            placeholders = ",".join("?" for _ in blocked) or "''"
            cursor = conn.execute(
                f"""
                UPDATE events SET approved = 1, updated_at = ?
                WHERE status != 'ignored' AND id NOT IN ({placeholders})
                """,
                [now, *blocked],
            )
        else:
            allowed = [event_id for event_id in event_ids if event_id not in blocked]
            if allowed:
                placeholders = ",".join("?" for _ in allowed)
                cursor = conn.execute(
                    f"UPDATE events SET approved = 1, updated_at = ? WHERE id IN ({placeholders}) AND status != 'ignored'",
                    [now, *allowed],
                )
            else:
                cursor = conn.execute("SELECT 0")
        blocked_count = len(blocked)
        approved = conn.execute(
            "SELECT COUNT(*) AS count FROM events WHERE approved = 1 AND status != 'ignored'"
        ).fetchone()["count"]
        total = conn.execute("SELECT COUNT(*) AS count FROM events WHERE status != 'ignored'").fetchone()["count"]
    return {
        "updated": cursor.rowcount,
        "approved": approved,
        "total": total,
        "blocked": blocked_count,
    }


def set_event_approval(event_id: str, approved: bool) -> dict[str, Any] | None:
    with get_db() as conn:
        if approved:
            conflict = conn.execute(
                """
                SELECT 1 FROM clashes
                WHERE status = 'open' AND (event_a_id = ? OR event_b_id = ?)
                LIMIT 1
                """,
                (event_id, event_id),
            ).fetchone()
            if conflict:
                raise ValueError("Resolve the open clash before approving this event.")
        conn.execute(
            "UPDATE events SET approved = ?, updated_at = ? WHERE id = ?",
            (1 if approved else 0, utc_now(), event_id),
        )
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return _event_public(row) if row else None


def update_event(event_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {
        "title",
        "course_code",
        "section",
        "event_type",
        "days",
        "start_time",
        "end_time",
        "event_date",
        "room",
        "instructor",
        "is_core",
    }
    fields = {key: value for key, value in values.items() if key in allowed}
    if not fields:
        return get_event(event_id)
    if "days" in fields and isinstance(fields["days"], list):
        fields["days"] = json.dumps(fields["days"])
    if "is_core" in fields:
        fields["is_core"] = 1 if fields["is_core"] else 0
    fields["approved"] = 0
    fields["synced"] = 0
    fields["updated_at"] = utc_now()
    assignments = ", ".join(f"{key} = ?" for key in fields)
    with get_db() as conn:
        conn.execute(f"UPDATE events SET {assignments} WHERE id = ?", [*fields.values(), event_id])
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    recompute_clashes()
    return _event_public(row) if row else None


def manual_parse_unparsed(unparsed_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM unparsed_rows WHERE id = ?", (unparsed_id,)).fetchone()
        if not row:
            return None
        source = conn.execute("SELECT * FROM sources WHERE id = ?", (row["source_id"],)).fetchone()
        if not source:
            return None
        event_id = new_id("evt")
        event = {
            "title": values.get("title") or "Manually added course",
            "course_code": values.get("course_code") or "",
            "event_type": values.get("event_type") or "lecture",
            "days": values.get("days") or [],
            "start_time": values.get("start_time") or "09:00",
            "end_time": values.get("end_time") or "10:00",
            "event_date": values.get("event_date"),
            "room": values.get("room") or "",
            "section": values.get("section") or "",
            "instructor": values.get("instructor") or "",
            "is_core": bool(values.get("is_core")),
            "confidence": 1.0,
            "source_row": row["source_row"],
            "raw_text": row["raw_text"],
        }
        key = identity_key(event) + ":manual"
        now = utc_now()
        conn.execute(
            """
            INSERT INTO events
              (id, source_id, run_id, identity_key, title, course_code, section, event_type, days,
               start_time, end_time, event_date, room, instructor, is_core, confidence, status,
               source_row, raw_text, evidence, trace_id, fingerprint, approved, synced, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?, ?, 0, 0, ?, ?)
            """,
            (
                event_id,
                row["source_id"],
                row["run_id"],
                key,
                event["title"],
                event["course_code"],
                event["section"],
                event["event_type"],
                json.dumps(event["days"]),
                event["start_time"],
                event["end_time"],
                event["event_date"],
                event["room"],
                event["instructor"],
                1 if event["is_core"] else 0,
                1.0,
                row["source_row"],
                row["raw_text"],
                json.dumps({"sourceName": source["name"], "manual": True}),
                trace_id(),
                events_fingerprint(event),
                now,
                now,
            ),
        )
        conn.execute("DELETE FROM unparsed_rows WHERE id = ?", (unparsed_id,))
    recompute_clashes()
    return get_event(event_id)


def delete_unparsed(unparsed_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM unparsed_rows WHERE id = ?", (unparsed_id,))
    return cursor.rowcount > 0


def delete_source(source_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM sources WHERE id = ?", (source_id,))
    recompute_clashes()
    return cursor.rowcount > 0


def dashboard() -> dict[str, Any]:
    settings = get_settings()
    with get_db() as conn:
        event_count = conn.execute("SELECT COUNT(*) AS n FROM events WHERE status != 'ignored'").fetchone()["n"]
        approved = conn.execute("SELECT COUNT(*) AS n FROM events WHERE approved = 1 AND status != 'ignored'").fetchone()["n"]
        synced = conn.execute("SELECT COUNT(*) AS n FROM events WHERE synced = 1 AND status != 'ignored'").fetchone()["n"]
        core_count = conn.execute("SELECT COUNT(*) AS n FROM events WHERE is_core = 1 AND status != 'ignored'").fetchone()["n"]
        clashes = conn.execute("SELECT COUNT(*) AS n FROM clashes WHERE status = 'open'").fetchone()["n"]
        unparsed = conn.execute("SELECT COUNT(*) AS n FROM unparsed_rows").fetchone()["n"]
        source_count = conn.execute("SELECT COUNT(*) AS n FROM sources").fetchone()["n"]
        last_run_row = conn.execute(
            """
            SELECT r.*, s.name AS source_name
            FROM runs r JOIN sources s ON s.id = r.source_id
            ORDER BY r.started_at DESC LIMIT 1
            """
        ).fetchone()
        status_rows = conn.execute(
            "SELECT status, COUNT(*) AS n FROM events GROUP BY status"
        ).fetchall()
        last_sync = conn.execute(
            "SELECT * FROM sync_runs ORDER BY created_at DESC LIMIT 1"
        ).fetchone()

    last_run = dict(last_run_row) if last_run_row else None
    if last_run and last_run.get("stats"):
        last_run["stats"] = json.loads(last_run["stats"])
    return {
        "summary": {
            "events": event_count,
            "approved": approved,
            "synced": synced,
            "core": core_count,
            "clashes": clashes,
            "unparsed": unparsed,
            "sources": source_count,
            "readiness": round((approved / event_count) * 100) if event_count else 0,
        },
        "settings": settings,
        "lastRun": last_run,
        "eventStatuses": {row["status"]: row["n"] for row in status_rows},
        "lastSync": dict(last_sync) if last_sync else None,
        "recentSources": list_sources()[:5],
    }


def seed_demo() -> str | None:
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM sources WHERE kind = 'demo' LIMIT 1").fetchone()
    if existing:
        return existing["id"]
    now = utc_now()
    source = {
        "id": new_id("src"),
        "name": "Fall 2026 · Master timetable",
        "kind": "demo",
        "location": "demo://northfield/fall-2026",
        "raw_text": sample_timetable(),
        "content_hash": "demo-fall-2026",
        "trace_id": trace_id(),
        "created_at": now,
    }
    create_source(source, status="queued")
    process_source(source["id"], force_fallback=True)
    return source["id"]


def reset_demo() -> str:
    with get_db() as conn:
        demo_rows = conn.execute("SELECT id FROM sources WHERE kind = 'demo'").fetchall()
        for row in demo_rows:
            conn.execute("DELETE FROM sources WHERE id = ?", (row["id"],))
        # A demo reset is a pristine workspace: drop the global sync audit trail too.
        conn.execute("DELETE FROM sync_runs")
    recompute_clashes()
    return seed_demo() or ""

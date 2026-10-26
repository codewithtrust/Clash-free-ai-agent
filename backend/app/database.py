from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .config import DB_PATH, DEFAULT_SETTINGS
from .utils import json_dumps, utc_now

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    trace_id TEXT NOT NULL,
    raw_text TEXT,
    content_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    trace_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    stage TEXT NOT NULL DEFAULT 'queued',
    engine TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    stats TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    run_id TEXT,
    identity_key TEXT NOT NULL,
    title TEXT NOT NULL,
    course_code TEXT,
    section TEXT,
    event_type TEXT NOT NULL DEFAULT 'lecture',
    days TEXT NOT NULL DEFAULT '[]',
    start_time TEXT,
    end_time TEXT,
    event_date TEXT,
    room TEXT,
    instructor TEXT,
    is_core INTEGER NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0.8,
    status TEXT NOT NULL DEFAULT 'verified',
    source_row INTEGER,
    raw_text TEXT,
    evidence TEXT,
    trace_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0,
    synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(source_id, identity_key)
);

CREATE TABLE IF NOT EXISTS clashes (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    source_id TEXT,
    pair_key TEXT NOT NULL,
    event_a_id TEXT NOT NULL,
    event_b_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    overlap_minutes INTEGER NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unparsed_rows (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    run_id TEXT,
    raw_text TEXT NOT NULL,
    reason TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0,
    source_row INTEGER,
    page INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_id);
CREATE INDEX IF NOT EXISTS idx_events_identity ON events(identity_key);
CREATE INDEX IF NOT EXISTS idx_clashes_status ON clashes(status);
CREATE INDEX IF NOT EXISTS idx_runs_source ON runs(source_id, started_at DESC);
"""


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA)
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, json_dumps(value)),
            )


def get_settings() -> dict[str, Any]:
    with get_db() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    output = dict(DEFAULT_SETTINGS)
    for row in rows:
        try:
            output[row["key"]] = json.loads(row["value"])
        except (TypeError, ValueError):
            output[row["key"]] = row["value"]
    return output


def update_settings(values: dict[str, Any]) -> dict[str, Any]:
    with get_db() as conn:
        for key, value in values.items():
            conn.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, json_dumps(value)),
            )
    return get_settings()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def event_to_public(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    item = dict(row)
    item["days"] = json.loads(item.get("days") or "[]")
    item["is_core"] = bool(item.get("is_core"))
    item["approved"] = bool(item.get("approved"))
    item["synced"] = bool(item.get("synced"))
    return item


def source_to_public(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    item = dict(row)
    item.pop("raw_text", None)
    return item


def now() -> str:
    return utc_now()


def path_exists(path: Path) -> bool:
    return path.exists()

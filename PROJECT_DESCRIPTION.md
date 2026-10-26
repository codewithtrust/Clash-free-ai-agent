# ClashFree — Project Description

**ClashFree is an AI-assisted schedule-integrity agent for university students.** It reads the messy timetables students actually receive, verifies every row it can, quarantines the rows it cannot, finds real class collisions, builds a study plan around the verified schedule, and waits for explicit human approval before anything is written to a calendar.

> No silent drops. No duplicate calendar events. A trace ID on every imported event.

---

## 1. The problem

University timetables do not arrive as clean data. They show up as PDFs exported from a portal, screenshots of a table, HTML pages, CSV downloads, or printed notices. Students then rebuild the schedule by hand, which creates three recurring failures:

1. **Rows get lost.** A low-legibility cell, a merged PDF column, or a missing time is silently skipped, and the student misses a class.
2. **Clashes go unnoticed.** A core lab and an elective can overlap on the same day; finding that by eye is error-prone.
3. **Re-imports duplicate everything.** Every timetable revision becomes another copy of the same events in Google Calendar or Apple Calendar.

Existing calendar apps assume the data is already correct. ClashFree treats the timetable itself as the unreliable part.

## 2. The solution

ClashFree turns ingestion into a reviewable, auditable pipeline:

```
ingest → normalize → verify → partition → human approval → sync
```

Every outcome has a visible home:

- **Verified events** land in the review queue and calendar.
- **Open collisions** are listed with severity and overlap minutes.
- **Unreadable rows** go to a quarantine bin with their raw text, source row, and a specific reason.
- **Approvals** are a hard gate: no `.ics` export and no Google Calendar write happens without them.
- **Runs** record what changed, what stayed the same, and which trace ID produced it.

The result is a workspace where the student can see exactly what the agent read, what it refused to guess, and what it is about to write.

## 3. Who it is for

- **Students** juggling overlapping lectures, labs, tutorials, and electives across a term.
- **Students with revised timetables** who need to re-import without duplicates.
- **Anyone who wants a calendar they can trust** rather than a best-effort copy of a PDF.

It is designed as a single-student workspace: one student, one term, one timetable at a time.

## 4. Core capabilities

### Ingestion
Upload `.txt`, `.csv`, `.json`, `.ics`, `.md`, `.pdf`, or images, or paste a live timetable URL. PDFs are parsed locally; dynamic pages can optionally be rendered with Playwright.

### Hybrid extraction
- A **deterministic parser** handles clean text, CSV, JSON, ICS, and simple PDF exports. It requires no API key.
- An optional **multimodal OpenAI reader** handles screenshots and messy scans when `OPENAI_API_KEY` is configured.
- Both paths produce the same normalized event schema, so downstream behaviour is identical.

### Verification and quarantine
Rows below the confidence threshold, or missing a usable day/time, are **never guessed and never dropped**. They are written to `unparsed_rows` with their raw text, source row number, and reason. A student can correct a row and promote it into a verified event.

### Clash detection
Events that share a day and overlap in minutes are flagged. Core-vs-elective pairs are marked high severity. Each clash keeps both event IDs, the overlap duration, and the student's resolution (`keep A`, `keep B`, `keep both`, `ignore`). Clash IDs are stable across re-runs, so a decision never points at a vanished record.

### Idempotent runs
Content hashes identify sources, stable identity keys and fingerprints identify events, and the sync ledger records what was exported. Re-processing a revised timetable updates in place instead of creating duplicates. Google Calendar writes carry private `clashfreeEventId` extended properties so a re-sync updates the same event.

### Human approval gate
Nothing reaches `.ics` or Google Calendar until it is approved. Events tied to an unresolved clash cannot be approved. "Approve safe set" deliberately skips blocked events.

### AI study timetable
The study agent derives a weekly plan from the verified timetable:

- One focused **60-minute block per subject**.
- Placed on the **day before that subject next meets** (a Monday Physics lecture gets a Sunday study block).
- Avoids every class slot, other study blocks, holidays, and reading week.
- Adds exam checkpoints when an exam date exists.
- Deterministic: the same timetable and term settings always produce the same plan.

Study blocks are suggestions. They are kept separate from the approval gate and are never marked as synced classes.

### Notification centre and email digest
The header bell collects open clashes, quarantined rows (grouped when there are many), pending approvals, and the latest study plan. The email digest lists every subject with its class days, time, room, instructor, study slot, focus, and exam checkpoint, plus the action items that need the student. It can be previewed in-app, downloaded as `.eml`, or delivered through SMTP; without SMTP it is written to a local outbox so the student can inspect exactly what would be sent.

### Calendar and export
A week grid and agenda render the verified schedule, with holidays and reading week excluded. Export is RFC 5545 `.ics` with stable UIDs, recurrence rules, `EXDATE` holiday exclusions, and trace metadata. Google Calendar OAuth sync is optional.

### Term rules
Institution, term name, term start/end, reading week, timezone, and holiday closures are editable in Settings, and every generated artifact respects them.

### Demo mode
A seeded timetable ships with 8 verified events, 7 subjects with study blocks, 2 genuine clashes, 1 quarantined low-legibility row, and 0 pre-approved events, so the integrity guarantees are visible immediately. Reset is one click and never deletes non-demo uploads.

## 5. How it works

### Architecture

```
React SPA (Vite + TypeScript + Tailwind)
        │  REST / JSON
        ▼
FastAPI application
  ├─ ingestion      file/URL intake, hashing, upload storage
  ├─ extractor      deterministic parser + optional multimodal model
  ├─ pipeline       normalization, identity, idempotency, partition,
  │                 clash recomputation, approvals, review actions
  ├─ study_plan     deterministic study blocks + study .ics
  ├─ notifications  inbox aggregation + email digest + SMTP/outbox
  ├─ calendar_export RFC 5545 builder + sync ledger
  └─ google_calendar OAuth + idempotent writes
        │
        ▼
SQLite (sources, runs, events, clashes, unparsed_rows, sync_runs, settings)
```

### Data model, at a glance

- **sources** — every uploaded file or URL, its content hash, and its trace ID.
- **runs** — one ingestion attempt, with stage, engine, stats, and errors.
- **events** — normalized classes/exams, with `approved`, `synced`, `trace_id`, and identity keys.
- **clashes** — overlapping pairs, severity, overlap minutes, resolution.
- **unparsed_rows** — quarantined raw rows with reasons.
- **sync_runs** — the export audit trail.
- **settings** — term rules, holidays, and workspace configuration.

### Request flow

1. **Ingest** — the file is stored, hashed, and a source + run are created.
2. **Extract** — the deterministic parser (or the optional model) proposes rows.
3. **Verify** — rows are scored; unreadable rows are quarantined.
4. **Reconcile** — new, updated, unchanged, and removed events are computed against the existing source.
5. **Partition** — clashes are recomputed; approval and sync eligibility are derived.
6. **Review** — the student resolves clashes, repairs quarantined rows, and approves events.
7. **Sync** — `.ics` or Google Calendar, gated on approval, recorded in the sync ledger.
8. **Study + digest** — the study plan and subject digest are generated from verified events only.

## 6. Tech stack

- **Frontend:** React 18, Vite 6, TypeScript, Tailwind CSS 3, React Router, Lucide icons, date-fns.
- **Backend:** Python 3.11+, FastAPI, Uvicorn, Pydantic, SQLite.
- **Parsing:** BeautifulSoup + HTTPX, pypdf, optional Playwright, optional OpenAI SDK.
- **Calendar:** RFC 5545 generator, optional Google Calendar API.
- **Quality:** pytest integrity suite, Playwright end-to-end flows, axe-core WCAG 2.1 AA scans.

The app is fully functional **without any API key** using the deterministic parser, demo data, study agent, digest, and `.ics` export.

## 7. The integrity contract

These are the product's non-negotiables, each backed by code and tests:

| Guarantee | How it is enforced |
| --- | --- |
| No silent drops | Unverifiable rows are persisted in `unparsed_rows` with raw text and reason |
| 100% traceability | Every source, run, event, clash, and export carries stable trace/source IDs |
| No duplicate events on re-run | Content hashes + identity keys + fingerprints + per-source reconciliation |
| No duplicate Google writes | Private extended properties keyed on the ClashFree event ID |
| Approval before writes | Exports and Google sync filter on `approved = 1` |
| Clash transparency | Overlaps exposed with severity, minutes, and an auditable decision |
| Deterministic study plan | Same timetable and term rules → identical blocks |
| Accessible UI | Every page and modal is axe-clean at desktop and mobile widths |

## 8. Experience and accessibility

The UI is a dashboard, not a form: an agent briefing and readiness score, a review queue with clash cards, a quarantine bin, a source ledger, a run history, a week calendar, a study board, and a notification centre.

- Friendly, low-friction framing (“Good evening, buddy.” / “Hii buddy”).
- Keyboard-focusable scroll regions and a visible focus ring.
- Semantic tables with scoped headers.
- Colour is never the only signal: clashes, quarantine, and approvals also carry labels and text.
- WCAG 2.1 AA verified with axe-core across all seven routes, the notification centre, the clash and sync modals, and mobile layouts.

## 9. What makes it different

Most student calendar tools optimise for **entry**. ClashFree optimises for **trust**:

- It treats the source as unreliable and proves what it read.
- It makes refusal a first-class outcome instead of a failure.
- It separates the machine's suggestion (study blocks) from the human's decision (approval).
- It makes every run explainable and every export repeatable.

The study timetable and digest are not bolted on: they are derived from the same verified event set that feeds the calendar, so the study plan cannot drift away from the real classes.

## 10. Current scope and limitations

- The deterministic parser is optimised for structured rows; arbitrary scanned layouts need the optional multimodal reader.
- Google Calendar is the only direct provider integration. Outlook/Microsoft Graph is a roadmap item; `.ics` already imports cleanly into Outlook and Apple Calendar.
- The workspace is single-student; multi-user accounts and shared institution feeds are not implemented.
- Notifications are in-app plus email digest, not mobile push.
- SQLite keeps setup at zero; the schema is PostgreSQL-compatible with a connection-layer change.
- Automatic clash resolution is intentionally not attempted: the agent presents evidence and requires a human decision.

## 11. Status

The project is a complete, locally runnable demonstration:

- Backend integrity suite: **14 tests passing**.
- End-to-end UI flows: **49 checks passing** (desktop and mobile).
- Accessibility: **axe-core WCAG 2.1 AA clean** on all routes and modals.
- Production build served by FastAPI at `http://127.0.0.1:8000`; development at `http://localhost:5173`.

See `README.md` for setup, endpoints, configuration, and the full test matrix.

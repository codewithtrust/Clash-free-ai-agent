# ClashFree

**An AI schedule-integrity agent for students.** ClashFree ingests messy timetables, reads every row it can verify, quarantines the rows it cannot, detects real class collisions, and waits for your explicit approval before writing anything to a calendar.

No silent drops. No duplicate calendar events. A trace ID on every imported event.

For a fuller project overview — problem, architecture, integrity contract, and scope — see [`PROJECT_DESCRIPTION.md`](PROJECT_DESCRIPTION.md).

---

## The problem

University timetables arrive as PDFs, screenshots, HTML pages, CSV exports, and institutional portal printouts. Students rebuild them by hand, miss clashes between a core lab and an elective, and re-import duplicates every time the timetable is revised.

ClashFree turns that into a reviewable pipeline:

```
ingest → normalize → verify → partition → human approval → sync
```

Every outcome is visible: verified events, open collisions, and unparsed rows in a quarantine bin.

## Feature highlights

| Area | What ClashFree does |
| --- | --- |
| Ingestion | Upload `.txt`, `.csv`, `.json`, `.ics`, `.md`, `.pdf`, and images; paste a live timetable URL |
| Extraction | Deterministic local parser for clean files; optional OpenAI multimodal reader for screenshots and messy scans |
| Legibility gate | Rows below 45% confidence, or missing days/times, are quarantined instead of guessed |
| Clash detection | Detects overlapping streams on the same day, flags core-vs-elective severity, exposes overlap minutes |
| Idempotent runs | Content hashes, stable identity keys, and event fingerprints prevent duplicate events on re-run |
| Traceability | Every source, run, event, clash, and export carries stable trace/source IDs |
| Human approval | Nothing reaches Google Calendar or `.ics` until events are approved |
| Review dashboard | Stats, readiness score, clash cards, unparsed-row bin, source ledger, run history |
| Calendar | Week grid + agenda, holiday/reading-week exclusions, event detail modal |
| Study agent | One focused 60-minute study block per subject, placed the day before the subject next meets; avoids classes, holidays, and reading week |
| Notification centre | Clash, quarantine, approval, and study alerts in the header bell |
| Email digest | Subject-by-subject class + study summary, previewable and downloadable as `.eml`; optional SMTP delivery |
| Export | RFC 5545 `.ics` with stable UIDs, recurrence rules, `EXDATE` holiday exclusions, and trace metadata |
| Google Calendar | Optional OAuth sync with private `clashfreeEventId` extended properties for in-place updates |
| Term rules | Institution, term dates, reading week, timezone, and holiday closures |
| Demo mode | Seeded timetable with 8 verified events, 2 real clashes, and 1 quarantined row — zero setup |

## Tech stack

- **Frontend:** React 18, Vite 6, TypeScript, Tailwind CSS 3, React Router, Lucide icons, date-fns
- **Backend:** Python 3.11+, FastAPI, Uvicorn, Pydantic, SQLite
- **Parsing:** BeautifulSoup + HTTPX (default), pypdf, optional Playwright for dynamic pages, optional OpenAI SDK
- **Calendar:** RFC 5545 generator + optional Google Calendar API

The app is fully functional **without any API key** using the deterministic parser, seeded demo, and `.ics` export.

---

## Quick start

### Prerequisites

- Python 3.11 or newer
- Node.js 18 or newer
- Windows, macOS, or Linux

### 1. Install backend

```bash
cd backend
python -m pip install -r requirements.txt
```

### 2. Install frontend

```bash
cd frontend
npm install
```

### 3. Start both servers

From the project root:

**Windows**

```bat
start.bat
```

**PowerShell**

```powershell
.\start.ps1
```

**Manual (two terminals)**

```bash
# terminal 1
cd backend
python -m uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend
npm run dev
```

Open **http://localhost:5173**. The API is at **http://127.0.0.1:8000**, with interactive docs at **http://127.0.0.1:8000/docs**.

On first boot the backend creates `backend/data/clashfree.db` and seeds the demo timetable automatically.

### 4. Production build (single server)

```bash
cd frontend
npm run build
cd ../backend
python -m uvicorn app.main:app --port 8000
```

When `frontend/dist` exists, FastAPI serves the built SPA at **http://127.0.0.1:8000**.

---

## Demo walkthrough

1. **Overview** shows the agent briefing, readiness score, upcoming classes, open clashes, and the last run trace.
2. **Review queue** lists every parsed event, highlights the two colliding pairs, and separates the quarantined row.
3. Resolve a clash by keeping stream A, keeping stream B, keeping both, or ignoring it.
4. Open the **unparsed row**, correct the missing fields, and promote it into a verified event — or delete it.
5. Approve individual events or approve the safe set.
6. **Review & sync** → download `.ics` or push to Google Calendar.
7. **Study plan** shows the AI-suggested weekly study timetable and the subject email digest.
8. **Calendar** renders the week grid with holidays and reading week excluded.
9. **Sources** shows the ingestion ledger, re-run history, and lets you re-process a source.
10. **Settings** edits term rules, holidays, reading week, timezone, and restores the demo.

The seeded demo contains:

- 8 verified events (lectures, labs, and one exam)
- 7 subjects with one suggested study block each
- 2 genuine clashes: `CS 201 vs ECO 210` and `CS 201L vs DES 110`
- 1 quarantined low-legibility row: `BIO 115`
- 0 pre-approved events, so the human approval gate is visible

Re-running the same source is designed to produce **zero new events** and **zero duplicates**.

---

## How integrity is enforced

### 1. Traceability

Every ingestion creates a `source` with a `trace_id`, every processing pass creates a `run` with its own trace, and every event stores its `trace_id`, `source_id`, `identity_key`, and `fingerprint`.

Exported `.ics` events include:

```
UID:<stable-hash>@clashfree.local
X-CLASHFREE-EVENT-ID:...
X-CLASHFREE-TRACE-ID:...
X-CLASHFREE-SOURCE-ID:...
```

### 2. No silent drops

Extraction always partitions rows into events **or** unparsed rows. A row is quarantined when:

- confidence is below `0.45`, or
- no day/date can be established, or
- start or end time is missing

Quarantined rows remain visible in the review queue with their raw text, reason, source row, and page number.

### 3. Idempotent delta processing

Each source has a SHA-256 content hash. Re-processing compares the new normalized stream against existing events using a stable identity key. Runs report `new`, `updated`, `unchanged`, `removed`, `parsed`, and `unparsed` counts.

Event fingerprints remain stable across revisions, so calendar sync updates the existing block instead of creating another one.

### 4. Human approval before writes

`POST /api/approvals` and per-event approval endpoints are the only path to a syncable state. The Google sync and `.ics` export both read only approved events.

Clash-linked events cannot be approved while a collision is open. `Approve all` approves the clean events and reports how many are waiting on mediation. Resolving a clash with **Keep A** or **Keep B** marks the other stream as intentionally ignored, while **Keep both** keeps both commitments in the queue. Every decision resets approvals for the affected events so the new state is reviewed explicitly.

### 5. Deterministic clash detection

Events that share a day and overlap in minutes are flagged. Core-vs-elective pairs are marked high severity. Clash records retain both event IDs, overlap duration, and the resolution chosen by the user. Clash IDs are stable across re-runs, so a decision never points at a vanished record.

---

## Study agent and email digest

The study timetable is **derived from the timetable you uploaded**, not a fixed template.

1. Verified events are grouped by course code; exams are held back as checkpoints.
2. Each subject gets one **60-minute** block on the day before its first class of the week (for example, a Monday Physics lecture gets a Sunday study block).
3. The block is placed in a free evening slot that does not overlap any class, another study block, a holiday, or reading week.
4. Blocks are returned as a weekly board, a subject-coverage table, and a downloadable `.ics` calendar (`X-CLASHFREE-STUDY` metadata on every event).
5. The email digest lists every subject with its class times, room, instructor, study slot, focus, and exam checkpoint, plus the action items the agent needs from you.

The generator is deterministic: the same timetable and term settings produce the same blocks. Study blocks are suggestions, kept separate from the approval gate and never marked as synced classes.

The header bell opens the notification centre. It collects open clashes, quarantined rows, pending approvals, and the latest study digest. The email can be previewed in-app and either delivered through SMTP or written to `backend/data/outbox/*.eml` when SMTP is not configured.

---

## Supported inputs

| Input | Default behavior | With OpenAI key |
| --- | --- | --- |
| `.txt`, `.md` | Deterministic parser | Deterministic |
| `.csv`, `.json` | Deterministic parser | Deterministic |
| `.ics` | Re-import of exported schedules | Deterministic |
| Text-based `.pdf` | Extracted with `pypdf` | Multimodal fallback if text is thin |
| Scanned `.pdf` | Quarantined unless OCR text exists | Multimodal extraction |
| `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`, `.tiff` | Quarantined without a key | Multimodal extraction |
| Live URL | HTTPX + BeautifulSoup table/text extraction | Optional Playwright rendering |

Accepted timetable shapes include pipe-delimited rows, CSV columns, free text with course codes, weekday names, time ranges, room numbers, and exam dates.

---

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Capabilities and version |
| `GET` | `/api/dashboard` | Summary, last run, sync preview, agent status |
| `GET` | `/api/events` | All verified events with evidence and trace metadata |
| `POST` | `/api/approvals` | Approve specific events or all safe events |
| `POST` | `/api/events/{id}/approval` | Approve or unapprove one event |
| `PATCH` | `/api/events/{id}` | Correct an event |
| `GET` | `/api/clashes` | Open and resolved collisions |
| `PATCH` | `/api/clashes/{id}` | Resolve a collision |
| `GET` | `/api/unparsed` | Quarantine bin |
| `POST` | `/api/unparsed/{id}/resolve` | Promote a corrected row |
| `DELETE` | `/api/unparsed/{id}` | Discard a quarantined row |
| `POST` | `/api/sources/upload` | Upload a document or image |
| `POST` | `/api/sources/url` | Scrape a live timetable |
| `POST` | `/api/sources/{id}/reprocess` | Re-run ingestion idempotently |
| `GET` | `/api/runs` | Run history and delta stats |
| `GET` | `/api/sync/preview` | Sync readiness |
| `GET` | `/api/sync/ics` | Download approved calendar |
| `GET` | `/api/study-plan` | Generated weekly study timetable |
| `GET` | `/api/study-plan/ics` | Download the study timetable as `.ics` |
| `GET` | `/api/notifications` | Notification centre payload + email digest |
| `GET` | `/api/notifications/email` | Email digest preview |
| `POST` | `/api/notifications/email/send` | Deliver by SMTP or write to the local outbox |
| `GET` | `/api/notifications/email/download` | Download the digest as `.eml` |
| `GET` | `/api/integrations/google/status` | OAuth state |
| `GET` | `/api/integrations/google/auth-url` | Begin OAuth |
| `POST` | `/api/integrations/google/sync` | Idempotent Google write |
| `GET/PUT` | `/api/settings` | Term rules and holidays |
| `GET` | `/api/sample` | Download the sample timetable |
| `POST` | `/api/demo/reset` | Restore the seeded demo |

---

## Configuration

Copy `backend/.env.example` to `backend/.env` and fill in only what you need.

### Optional AI extraction

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=   # for Azure or compatible gateways
```

Without a key, ClashFree reports `local-rules-v1` and still handles clean text, CSV, JSON, ICS, and text-based PDFs.

### Optional Google Calendar

1. Create a Google Cloud project and enable the **Google Calendar API**.
2. Create an OAuth 2.0 Client ID of type **Web application**.
3. Add this authorized redirect URI:

   ```
   http://127.0.0.1:8000/api/integrations/google/callback
   ```

4. Set the credentials:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/api/integrations/google/callback
FRONTEND_URL=http://localhost:5173
```

5. Restart the backend and use **Integrations → Connect Google**.
6. Approved events sync to the primary calendar. Re-syncing updates in place via the private `clashfreeEventId` extended property.

### Optional dynamic scraping

```env
ENABLE_PLAYWRIGHT=1
```

Then install the browser once:

```bash
python -m playwright install chromium
```

### Optional email delivery

Without SMTP, the digest is written to `backend/data/outbox/*.eml` and can be downloaded from the app. To send it for real:

```env
NOTIFICATIONS_TO=buddy@northfield.edu
NOTIFICATIONS_FROM=clashfree@northfield.edu
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
# SMTP_STARTTLS=1
# SMTP_USE_SSL=0   # set 1 for implicit TLS on port 465
```

### Other environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLASHFREE_DATA_DIR` | `backend/data` | SQLite database, uploads, outbox, Google token |
| `CLASHFREE_DB_PATH` | `backend/data/clashfree.db` | Override the database file |
| `ENABLE_PLAYWRIGHT` | `0` | Render JavaScript-heavy pages |
| `FRONTEND_URL` | `http://localhost:5173` | OAuth return destination |
| `NOTIFICATIONS_TO` | `buddy@northfield.edu` | Default digest recipient |
| `NOTIFICATIONS_FROM` | `clashfree@northfield.edu` | Digest sender |
| `SMTP_HOST` | empty | Enables SMTP delivery when set |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_STARTTLS` | `1` | Upgrade a plain SMTP connection with STARTTLS |
| `SMTP_USE_SSL` | `0` | Use implicit TLS (typically port 465) |

---

## Project structure

```
Agent/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI routes, lifespan, SPA serving
│   │   ├── config.py               # Environment + default term rules
│   │   ├── database.py             # SQLite schema and settings helpers
│   │   ├── utils.py                # IDs, hashes, timestamps
│   │   └── services/
│   │       ├── ingestion.py        # File/URL/PDF/HTML/Playwright ingestion
│   │       ├── extractor.py        # Deterministic + multimodal extraction
│   │       ├── pipeline.py         # Idempotency, partition, clashes, approvals
│   │       ├── study_plan.py       # Deterministic study timetable + study ICS
│   │       ├── notifications.py    # Notification centre + email digest
│   │       ├── calendar_export.py  # RFC 5545 build + sync ledger
│   │       └── google_calendar.py  # OAuth + idempotent Google writes
│   ├── data/                       # Generated: DB, uploads, outbox, token
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/             # Shell, modals, shared UI
│   │   ├── context/                # App data + toasts
│   │   ├── lib/                    # API client, date/color helpers
│   │   ├── pages/                  # Overview, Review, Calendar, Study plan, Sources, Integrations, Settings
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── tailwind.config.js
│   └── vite.config.ts
├── start.bat
├── start.ps1
└── README.md
```

---

## Verification checklist

The product goals map to concrete checks:

- **100% traceable events** — every event stores `trace_id`, `source_id`, `identity_key`, and `fingerprint`; ICS exports repeat the IDs.
- **Zero silent drops** — parse outcomes are always an event or a quarantined row with a human-readable reason.
- **Zero duplicate calendar events on re-run** — content hashes + identity keys + fingerprints + Google extended properties.
- **Human approval gate** — exports and Google sync filter on `approved = 1`.
- **Clash transparency** — overlapping pairs are listed with severity, overlap minutes, and a user decision.
- **Nothing silently broken in the UI** — every page, the notification centre, and the clash and sync modals pass an axe-core WCAG 2.1 AA scan at desktop and mobile widths.

### Automated tests

The backend suite asserts the integrity contract end to end against a temporary database, so it never touches your working data:

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest tests -q
```

Coverage:

| Test | Guarantees |
| --- | --- |
| `test_demo_seed_and_capabilities` | Demo shape (8 events / 2 clashes / 1 unparsed / 0 approved) and reported capabilities |
| `test_unparsed_rows_are_never_dropped` | Quarantined rows keep raw text, row number, and a specific reason |
| `test_approval_gate_blocks_clash_linked_events` | Approve-all skips clash-linked events and single approvals are rejected |
| `test_keep_one_resolves_and_ignores_the_other` | `keep_a` hides the losing event and clears its approval |
| `test_keep_both_allows_clean_approval_and_ics` | Full approval → 8 `BEGIN:VEVENT` blocks with trace metadata |
| `test_reprocess_is_idempotent` | Re-processing the same source creates zero duplicates |
| `test_resolved_clash_audit_survives_reprocess` | Resolutions persist with their audit record |
| `test_custom_source_and_settings_round_trip` | Settings persist and a new upload reconciles against existing events |
| `test_study_plan_covers_every_subject_once` | One 60-minute block per verified subject, never on that subject's class day |
| `test_study_blocks_never_overlap_classes_or_each_other` | Study blocks stay clear of class times and other study blocks |
| `test_study_plan_is_deterministic` | Repeating the request returns identical blocks and summary |
| `test_study_plan_ics_export` | Study `.ics` contains one traced weekly event per subject |
| `test_notifications_and_email_digest` | Clash, quarantine, approval, and study alerts plus a subject digest |
| `test_email_digest_is_written_to_outbox_when_smtp_is_missing` | Local `.eml` fallback and download endpoint |

Quick manual smoke test:

```bash
cd backend
python -c "from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); c.__enter__(); print(c.get('/api/dashboard').json()['summary']); c.__exit__(None,None,None)"
```

Expected demo summary: 8 events, 2 clashes, 1 unparsed row.

Reset the demo workspace at any time. This deletes the demo source (and its events, runs, clashes, and quarantined rows) plus the sync audit trail, then reseeds. Uploaded files and their sources are left untouched:

```bash
curl -X POST http://127.0.0.1:8000/api/demo/reset
```

---

## Known limitations and next steps

- The deterministic parser is optimized for structured rows; arbitrary scanned layouts need the multimodal reader.
- Google Calendar is the only direct provider integration. Outlook/Microsoft Graph is on the roadmap; `.ics` already imports cleanly into Outlook and Apple Calendar.
- The app is a single-student workspace. Multi-user accounts and shared institution feeds are not implemented; notifications are in-app plus the email digest rather than mobile push.
- SQLite is used for zero-setup local operation. The schema is PostgreSQL-compatible with a connection-layer change.
- Automatic clash resolution is intentionally not attempted: the agent surfaces evidence and requires a human decision.

---

## License

Built as a portfolio-grade agent demonstration. Use and adapt freely.

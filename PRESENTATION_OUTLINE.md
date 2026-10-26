# ClashFree — 5-Slide Presentation Outline

**Deck:** Agentic AI project presentation
**Presenter:** Astha Gupta (Solo)
**Target length:** 4–5 minutes + live demo
**Tone:** confident, specific, numbers over adjectives

**Design system (matches the product):**
- Background: ink `#0D1411`
- Accent: lime `#C7F06A`
- Secondary: teal `#277A60`, coral `#DF5D48`
- Type: bold display headings, one idea per slide, minimum 24 pt body
- Every slide gets one visual: product UI, diagram, or a single number

---

## Slide 1 — Project & Team Overview

### On the slide

**ClashFree**
*The schedule-integrity agent that refuses to guess.*

> Upload a messy timetable → get a verified, clash-free calendar and a study plan — with a trace ID on every row.

**Team**
- **Astha Gupta** — Solo
- Role: product design, frontend, backend, agent pipeline, testing

**At a glance**
- AI-assisted timetable ingestion + verification
- Clash detection + human approval gate
- AI study timetable + subject email digest
- React · FastAPI · SQLite · optional OpenAI · optional Google Calendar

**Footer:** Live demo: `localhost:5173` · Docs: `/docs`

### Speaker notes
ClashFree is an agentic AI application for students. It takes the timetable students actually receive — PDFs, screenshots, portal exports — and turns it into a calendar they can trust. I built the full stack solo: the React dashboard, the FastAPI agent runtime, the verification pipeline, the study planner, and the email digest. The core promise is simple: no row is silently dropped, no calendar event is duplicated, and nothing is written without approval.

---

## Slide 2 — The Problem & The Agentic Solution

### On the slide

**The problem**
- Timetables arrive as PDFs, scans, HTML, CSV — not clean data
- Students rebuild them by hand → missed classes, hidden clashes
- Every revised timetable creates duplicate calendar events
- Unreadable rows are silently skipped by ordinary tools

**Why a chatbot or plain automation is not enough**
- A chat LLM summarizes a page; it cannot guarantee every row is persisted
- Regex automation handles clean text, then fails silently on messy layouts
- Neither keeps a run ledger, diff, or approval history
- Neither can safely write to a calendar or prove what it wrote

**The agentic solution**
```
ingest → normalize → verify → partition → human approval → sync
```
- **Tool use:** parser, PDF reader, clash engine, study planner, ICS writer, SMTP
- **Memory:** SQLite sources, runs, events, clashes, quarantine, sync ledger
- **Autonomy with guardrails:** the agent acts end-to-end; irreversible writes wait for a human
- **Refusal as an outcome:** low-confidence rows are quarantined, never guessed

### Speaker notes
The key insight is that the timetable is the unreliable part, not the calendar. A standard chatbot can describe a timetable but cannot prove it read every row, cannot remember what changed between revisions, and cannot guarantee it will not invent a time. Plain automation is brittle: it works on a clean CSV, then quietly skips a merged PDF cell. ClashFree is agentic in a deliberate way: it plans and executes a multi-step workflow with tools and persistent state, but it draws a hard boundary at writes. The agent can read, reason, reconcile, and prepare; the human approves. That combination is what makes it trustworthy rather than just impressive.

---

## Slide 3 — System Architecture & Data Flow

### On the slide

**Block diagram**

```
┌──────────────────────────────────────────────────────────────┐
│                    Student (React SPA)                       │
│   Overview · Review queue · Study plan · Calendar · Sources   │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST / JSON
┌───────────────────────────▼──────────────────────────────────┐
│              FastAPI Agent Runtime (orchestrator)             │
│                                                              │
│  ① Ingest ─► ② Extract ─► ③ Verify ─► ④ Reconcile ─► ⑤ Clash  │
│      │           │            │            │           │     │
│   hash +     deterministic  confidence   identity    overlap │
│   trace      parser / LLM     gate        keys        engine  │
│                                                              │
│  ⑥ Human approval gate ─► ⑦ Sync / Export                     │
│         (approved = 1)        ICS · Google Calendar           │
│                                                              │
│  Study agent ──► weekly blocks + study .ics                   │
│  Notifier    ──► inbox + subject email (SMTP / outbox)        │
└───────────────────────────┬──────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌─────────────────────────┐          ┌─────────────────────────┐
│ SQLite memory           │          │ External tools          │
│ sources · runs · events │          │ OpenAI (optional)       │
│ clashes · unparsed_rows │          │ Google Calendar (OAuth) │
│ sync_runs · settings    │          │ SMTP (optional)         │
└─────────────────────────┘          └─────────────────────────┘
```

**Orchestration framework**
- **Custom Python orchestrator inside FastAPI** — no LangChain / CrewAI / AutoGen
- Why: deterministic stages, explicit state, no hidden agent loops, small dependency surface
- The LLM is a **perception tool used by the agent**, not the controller of the agent

**Memory layers**
- **Operational:** `sources`, `runs`, `events`, `clashes`, `unparsed_rows`
- **Audit:** `sync_runs` + trace IDs on every record
- **Configuration:** `settings` (term dates, reading week, holidays, timezone)

### Speaker notes
This is the whole system on one slide. The agent runs as a deterministic state machine: ingest, extract, verify, reconcile, detect clashes, then wait at the approval gate before syncing. That arrow through the center is the agentic loop — each stage calls a tool and writes its result to memory, so the next stage reasons over verified state rather than a chat transcript. I deliberately did not use LangChain, CrewAI, or AutoGen. For a system where a wrong write matters, I wanted visible stages, reproducible outputs, and an auditable ledger, not an opaque agent loop. The optional OpenAI model is invoked only as a perception tool when the deterministic parser cannot read a file. SQLite is the memory: it stores what the agent read, what it refused to read, what it decided, and what it exported.

---

## Slide 4 — Technical Stack & Agent Tools

### On the slide

**Stack**

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS 3, React Router, Lucide, date-fns |
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic |
| Memory | SQLite (PostgreSQL-compatible schema) |
| Extraction | Deterministic parser, pypdf, BeautifulSoup + HTTPX, optional Playwright |
| AI (optional) | OpenAI SDK, `gpt-4o-mini` default, any OpenAI-compatible base URL |
| Calendar | RFC 5545 `.ics` generator, Google Calendar API (OAuth 2.0) |
| Notifications | In-app centre, `.eml` outbox, SMTP delivery |
| Quality | pytest, Playwright, axe-core WCAG 2.1 AA |

**Agent tools**
1. **Timetable parser** — text, CSV, JSON, ICS, Markdown, simple PDFs
2. **Multimodal reader** — optional vision model for screenshots and messy scans
3. **Confidence gate** — scores each row; below threshold → quarantine with reason
4. **Reconciliation engine** — hashes + identity keys + fingerprints; new/updated/unchanged/removed
5. **Clash engine** — day + minute overlap, severity, stable clash IDs
6. **Study planner** — one 60-minute block per subject, day before class, avoids holidays/reading week
7. **ICS exporter** — stable UIDs, RRULE, EXDATE, trace metadata
8. **Google Calendar client** — private `clashfreeEventId` for idempotent updates
9. **Digest + notifier** — aggregates clashes/quarantine/approvals/study; SMTP or `.eml`

**APIs & credits**
- OpenAI API (optional) · Google Calendar API (optional) · SMTP (optional)
- Everything above runs key-free with the deterministic parser, demo, study plan, digest, and `.ics`

### Speaker notes
The stack is intentionally boring where reliability matters and modern where the student experiences it. React and Tailwind give a fast, accessible dashboard; FastAPI gives a typed, testable agent runtime; SQLite keeps setup at zero. The interesting layer is the tool set. Each tool has one job and writes a traceable result. The parser is the default. The multimodal model is a fallback, not a dependency. The reconciliation engine and the approval gate are what prevent the two classic failures: duplicates on re-import, and unapproved writes. I also built the study planner and digest on top of the same verified events, so they cannot drift from the real timetable. No key is required to demo the whole product.

---

## Slide 5 — Live Demo / Impact

### On the slide

**Demo path (≈2 minutes)**
1. **Overview** — “Good evening, buddy.” 8 verified events · 2 clashes · 96 quarantined rows
2. **Review queue** — resolve `CS 201 vs ECO 210`; inspect the `BIO 115` quarantine row
3. **Approve** — approve the safe set; clash-linked events stay blocked
4. **Export** — download `.ics` (8 events); re-run → 0 duplicates
5. **AI study plan** — 7 subjects → 7 blocks, 7 hours, one per subject
6. **Notification centre** — 4 actionable items; send/download the subject digest

**Impact**
- **100% of rows accounted for** — verified or quarantined, never silently dropped
- **0 duplicate events** after re-processing the same source
- **7/7 subjects** covered by the study plan
- **4** actionable notifications from **96** quarantined rows (grouped, not flooding)
- **Key-free demo** — deterministic parser + `.ics` export always work
- **WCAG 2.1 AA clean** — 14 backend tests, 49 end-to-end checks, axe-clean UI

**Screenshots to capture**
1. Overview with readiness score, clash cards, study timetable, digest preview
2. Review queue with conflict resolution + quarantine bin
3. Study plan weekly board + class/study pairing table
4. Notification centre with subject digest and `.eml` download
5. Exported `.ics` / downloaded file (or the success toast)

**Video fallback:** 60–90 s screen recording of steps 1–6, kept local in case the live demo fails.

### Speaker notes
The demo tells the integrity story in order. First I show what the agent read and what it refused to guess. Then I resolve a real clash; the approval gate prevents the colliding events from being approved. Export produces a calendar with a traceable event for every approved class. Re-running the same source creates no duplicates, which is the guarantee students actually feel. The study plan is generated from the same verified subjects, so a Monday class gets a Sunday study block and nothing overlaps. Finally, the notification centre rolls 96 quarantined rows into one actionable alert and previews the email digest. The takeaway is not that the agent does more; it is that the agent is accountable for every row it touches.

---

## Optional closing slide — One line to leave on screen

> **ClashFree: the agent reads, reasons, and prepares. You decide what gets written.**

Contact: Astha Gupta · `localhost:5173` · `/docs`

---

## Appendix A — Anticipated judge questions

| Question | Answer |
| --- | --- |
| “Where is the LLM? Is this really agentic?” | The agentic layer is the multi-step planner/executor with tools, memory, and guardrails. The LLM is an optional perception tool for messy inputs; the default deterministic path is what makes the system auditable. The demo runs with or without a key. |
| “Why not LangChain / CrewAI / AutoGen?” | Explicit staged orchestration. For calendar writes, hidden agent loops are a liability. Every step is testable, reproducible, and traced. |
| “How do you prevent hallucinated times?” | The model never writes an event directly. Its output is normalized, confidence-scored, and checked against required fields; failures go to quarantine. The deterministic parser is the default. |
| “How are duplicates prevented?” | Content hashes, stable identity keys, event fingerprints, per-source reconciliation, and a sync ledger. Google writes use private `clashfreeEventId` properties. |
| “What if the PDF is unreadable?” | That is a supported outcome: the row is quarantined with raw text, source row, and reason, and surfaced as a grouped notification. Nothing is guessed. |
| “What is the study plan based on?” | Only verified events: one 60-minute block per subject, the day before its first class day, avoiding classes, other blocks, holidays, and reading week. It is a suggestion, separate from the approval gate. |
| “Does it work offline / without paid APIs?” | Yes. Deterministic parser, SQLite, study agent, digest, and `.ics` export require no key. OpenAI and Google Calendar are optional. |
| “How is accessibility handled?” | axe-core WCAG 2.1 AA scans across all routes and modals; keyboard-focusable scroll regions; labels and text alongside colour. |

## Appendix B — Pre-demo checklist

- [ ] Backend running at `http://127.0.0.1:8000` (health shows `studyAgent: true`, `emailDigest: true`)
- [ ] Frontend at `http://localhost:5173` (or the production build on `:8000`)
- [ ] Demo reset for a clean state (8 events / 2 clashes / 1 demo unparsed / 0 approved)
- [ ] Closes: no stray modals, no dev tools, browser zoom at 100%
- [ ] Screenshots saved locally as a backup
- [ ] 60–90 s screen recording as a fallback
- [ ] Terminal hidden; if shown for tests, use `python -m pytest tests -q` → `14 passed`

## Appendix C — Numbers to memorize

| Fact | Value |
| --- | --- |
| Demo verified events | 8 |
| Genuine clashes | 2 |
| Quarantined rows in live workspace | 96 (1 demo + 95 from a real PDF) |
| Subjects / study blocks | 7 / 7 |
| Weekly study time | 7 hours (420 minutes) |
| Study `.ics` events | 7 |
| Notification items / unread | 5 / 4 |
| Backend tests | 14 passed |
| End-to-end checks | 49 passed |
| Accessibility | WCAG 2.1 AA clean |

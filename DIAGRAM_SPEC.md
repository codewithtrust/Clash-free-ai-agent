# Slide 3 — Diagram Specification (hand-off brief)

Give this file to the person building the flow diagram. It contains the exact boxes, arrows, labels, and layout. No design guesswork is required.

---

## 1. Purpose

One 16:9 slide diagram that explains how the ClashFree agent works end-to-end:

- the main agent pipeline,
- where the optional LLM sits,
- where rows go when they fail verification,
- where the human approval gate is,
- what the agent remembers,
- and what it produces.

The diagram must make one idea obvious: **the LLM is an optional tool inside extraction, not the brain of the system.**

---

## 2. Canvas and layout

- **Size:** 13.33 × 7.5 in (16:9), 0.5 in safe margins.
- **Layout:** vertical main spine in the center-left, review loop on the left, outputs on the right, memory bar across the bottom.
- **Reading order:** top → bottom down the spine; branches flow left (exceptions) and right (outputs).
- **Container:** wrap stages 1–7, the Study agent, and the Notifier in one large rounded rectangle labelled:

  > **FastAPI agent runtime — custom orchestrator**
  > *no LangChain / CrewAI / AutoGen*

- Place a small person icon on **6 Human approval** to signal that the student makes this decision.

### Rough placement

```
┌─────────────────────────────────────────────────────────────────────┐
│  FastAPI agent runtime — custom orchestrator                        │
│                                                                     │
│   [Student / React SPA]                                             │
│             │                                                       │
│             ▼                                                       │
│   [1 Ingest] ──────────────┐                                        │
│             │              │                                        │
│             ▼              │                                        │
│   [2 Extract] ◄╌╌╌╌ [Optional OpenAI vision]                       │
│             │                                                       │
│             ▼                                                       │
│   [3 Verify] ──fail──► [Quarantine bin] ──► [Review queue]          │
│             │ pass                          ▲     ▲                 │
│             ▼                               │     │                 │
│   [4 Reconcile]                             │     │                 │
│             │                               │     │                 │
│             ▼                               │     │                 │
│   [5 Clash engine] ──open clash─────────────┘     │                 │
│             │ no clash                            │                 │
│             ▼                                     │                 │
│   [6 Human approval] ◄── resolve / repair / approve                 │
│             │ approved                            │                 │
│             ▼                                     │                 │
│   [7 Export] ──► [.ics file] / [Google Calendar]  │                 │
│             │                                     │                 │
│             ▼                                     │                 │
│   [Sync ledger]                                   │                 │
│                                                                     │
│   [Study agent] ──► [Study blocks + study .ics]   │                 │
│   [Notifier]    ──► [Inbox + email digest]        │                 │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │ state + audit
        ▼
   [SQLite memory]
```

Use this sketch for placement only. Draw the real version with proper boxes and arrows.

---

## 3. Nodes

| ID | Label | Sub-label (small text) | Shape | Colour |
| --- | --- | --- | --- | --- |
| A | Student | React SPA dashboard | Rounded rectangle | White / neutral |
| B | 1 Ingest | Upload, URL, hash, trace ID | Rounded rectangle | Ink `#0D1411`, white text |
| C | 2 Extract | Deterministic parser | Rounded rectangle | Ink, white text |
| D | 3 Verify | Confidence + required fields | Rounded rectangle | Ink, white text |
| E | 4 Reconcile | New / updated / unchanged / removed | Rounded rectangle | Ink, white text |
| F | 5 Clash engine | Day + minute overlap | Rounded rectangle | Ink, white text |
| G | 6 Human approval | Student decides | Gate / diamond with person icon | Lime outline `#C7F06A` |
| H | 7 Export | Approved events only | Rounded rectangle | Ink, white text |
| I | Quarantine bin | Raw row + reason kept | Container / tray | Coral `#DF5D48` tint |
| J | Review queue | Resolve · repair · approve | Container / tray | Amber tint |
| K | Study agent | 1 block per subject, day before | Rounded rectangle | Teal `#277A60` |
| L | Notifier | Clashes · quarantine · study | Rounded rectangle | Teal |
| M | SQLite memory | sources · runs · events · clashes · sync_runs · settings | Cylinder | Grey |
| N | Calendar output | `.ics` + Google Calendar | Document / calendar icon | Teal |
| O | Study output | Study blocks + study `.ics` | Document / calendar icon | Teal |
| P | Digest output | Inbox + email (`.eml` / SMTP) | Document / mail icon | Teal |
| Q | Sync ledger | What was exported, when | Ledger / cylinder | Grey |
| R | Optional OpenAI vision | Only if configured | Rounded rectangle, dashed border | Grey, dashed |

**Text limit per node:** title ≤ 3 words, sub-label ≤ 6 words.

---

## 4. Arrows

| # | From → To | Label on arrow | Style |
| --- | --- | --- | --- |
| 1 | Student → Ingest | upload / URL | Solid |
| 2 | Ingest → Extract | normalized rows | Solid |
| 3 | Extract → Verify | candidate events | Solid |
| 4 | Verify → Quarantine | fail: low confidence / missing fields | **Red dashed** |
| 5 | Quarantine → Review queue | repair & promote | Red dashed |
| 6 | Verify → Reconcile | pass | Solid |
| 7 | Reconcile → Clash | verified event set | Solid |
| 8 | Clash → Review queue | open clash (blocks approval) | **Amber solid** |
| 9 | Clash → Approval | no open clash | Solid |
| 10 | Review queue → Approval | resolve / approve | **Amber dashed** (loop back) |
| 11 | Approval → Export | approved = 1 | **Green solid** `#7BAE2E` |
| 12 | Approval → Review queue | pending | Amber dashed (loop back) |
| 13 | Export → Calendar output | `.ics` / Google | Solid |
| 14 | Export → Sync ledger | record export | Solid |
| 15 | Reconcile → Study agent | verified events only | Solid, teal |
| 16 | Study agent → Study output | weekly blocks | Solid, teal |
| 17 | Clash + Quarantine + Approval + Study → Notifier | actionable items | Solid, teal (can be one bundled arrow) |
| 18 | Notifier → Digest output | inbox + email | Solid, teal |
| 19 | Agent runtime ↔ SQLite memory | read / write state + audit | Thick double arrow |
| 20 | Optional OpenAI → Extract | only if configured | **Dashed grey** |

If 20 arrows is too dense for the slide, keep 1–19 and draw the LLM as a dashed side box with a single dashed arrow into Extract. Do not remove the approval, quarantine, or clash branches — they are the point of the diagram.

---

## 5. Containers and grouping

- **Agent runtime** — large rounded rectangle around A–H, K, L. Label at top-left.
- **Exceptions** — a light coral/amber zone on the left containing I (Quarantine) and J (Review queue). A dashed loop returns from J to G.
- **Outputs** — a light teal zone on the right containing N, O, P. Q (Sync ledger) sits under H.
- **Memory** — a full-width grey bar at the bottom with M, connected to the runtime with one double arrow. Do not draw an arrow from every stage to M; one thick connector keeps the slide readable.

---

## 6. Legend (put bottom-right, small)

- **Solid arrow** — automatic agent step
- **Dashed arrow** — optional input or human review loop
- **Red** — verification failure / quarantine
- **Amber** — blocked or pending approval
- **Green** — approved write
- **Dashed grey box** — optional external AI, not the orchestrator

---

## 7. Copy to put on the slide (short version)

**Title:** How the agent works

**Subtitle:** Deterministic stages, persistent memory, human-approved writes.

**Three callouts beside the diagram:**
1. **No silent drops** — every unreadable row lands in quarantine with its raw text and reason.
2. **No duplicate writes** — hashes, identity keys, and a sync ledger make re-runs idempotent.
3. **No unapproved sync** — the approval gate filters every `.ics` and Google Calendar write.

**Footer:** OpenAI is optional and used only for extraction. The orchestrator is a custom FastAPI state machine.

---

## 8. Plain-text flow (for reference or a text-only slide)

```
Upload / URL
  → 1 Ingest (hash + trace)
  → 2 Extract (deterministic parser; optional OpenAI vision)
  → 3 Verify (confidence + required fields)
       ├─ fail → Quarantine bin (raw text + reason) → Review queue
       └─ pass → 4 Reconcile (new / updated / unchanged / removed)
  → 5 Clash engine
       ├─ open clash → Review queue (blocks approval)
       └─ no clash → 6 Human approval
  → 6 Human approval
       ├─ pending → Review queue
       └─ approved → 7 Export (.ics / Google Calendar) → Sync ledger

Side outputs:
  Verified events → Study agent → weekly study blocks + study .ics
  Clashes + quarantine + approvals + study → Notifier → inbox + email digest
```

---

## 9. Do / don't

**Do**
- Keep the spine vertical; it reads naturally on a slide.
- Use numbered stages 1–7 — they match the spoken script.
- Show the review loop clearly: quarantine and clashes both feed the same queue.
- Make the approval gate visually distinct (lime outline, person icon).
- Keep the LLM dashed and secondary.

**Don't**
- Don't draw the LLM in the center or above the pipeline.
- Don't connect every table in SQLite with its own arrow — one memory connector is enough.
- Don't add a generic "AI" cloud icon.
- Don't use more than two font sizes inside boxes.
- Don't remove the failure branches to make it look cleaner. The failure path is the product.

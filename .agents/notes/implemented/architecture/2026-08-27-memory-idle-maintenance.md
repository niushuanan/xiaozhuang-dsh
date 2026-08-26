# Agent Note: AI memory maintenance follows conversation quiet, not the clock

Status: implemented

English | [中文](2026-08-27-memory-idle-maintenance.zh.md)

## Problem

The AI-maintained half of long-term memory ran once per local midnight with a 60-second grace window, scanned only the calendar day that just ended, never replayed a missed midnight, and swallowed failures into one warn log. On real laptop deployments this made the feature invisible: midnights are exactly when machines sleep, so `state.json` on the author's own machine showed no successful run ever (`lastDailyCursor: 0`, no `lastMaintenanceAt`, no `ai.md`). Worse, `lastDailyCursor` was written but never used to compute a scan start, so any day whose midnight was missed was lost forever — silently.

## Decision

Replace the wall-clock schedule with one monotonic millisecond cursor and three event-driven triggers (`IdleMemoryScheduler`):

1. **Quiet period** — any session-bus event restarts an `idleDelayMs` timer (Config field, default five minutes). Scheduled passes only curate events older than the horizon `now - idleDelayMs`, so evidence enters memory strictly after its conversation went quiet.
2. **Startup backfill** — mounting DSH immediately runs one pass over everything above the cursor, recovering machine-off gaps instead of dropping them.
3. **Explicit organize now** — Settings' AI tab gains a real button (`POST /plugins/memory-system/api/maintain`) that runs through the current instant; while a pass is active it answers `busy`.

Passes serialize; triggers landing during a running pass coalesce into exactly one follow-up. The cursor advances — and any persisted `lastMaintenanceError` clears — only after every model batch of the window commits, so a failed window retries in full at the next trigger without dropping evidence. Failures persist `{at, message}` into `MemoryState.lastMaintenanceError` (the sleep-late fire after host wake needs no grace period: the condition is relative, not absolute). The old `lastDailyCursor` field migrates by read; revision reason `daily-maintenance` became `auto-maintenance`. Settings renders the failure line plus success time it already showed.

Untouched by design: document storage and revisions, redaction, living-document prompt semantics ("reconsider every entry", still not an append-only digest), recall gating, the product-owned flash route, and each memory surface's independent switch.

## Consequences

- The "does nothing on laptops" failure mode is gone; cost shape changes from one large nightly call to several small bounded calls per active stretch, on the cheapest route, with no-op passes writing no revision.
- Cursor-incremental windows make maintenance crash-safe and replayable; multi-day backlogs batch through the existing splitter unchanged.
- The settings page now tells the truth about automation state (success time already shown; failures become visible; a working manual trigger doubles as the escape hatch).
- Rejected neighbor: keeping a midnight fallback alongside idle triggers — two scheduling truths would behave unpredictably around sleep and defeat the single-sentence mental model ("it remembers shortly after you finish talking").
- Pre-existing gap left open, now documented here rather than silently ignored: the plugin ships without a Loader-level REAL composition test (only unit/host-face specs); building that harness remains deferred work for the next memory-surface sweep.

## Alternatives considered

- **Keep midnight + startup catch-up only** — rejected as minimal-motion but intuition-breaking: users do not model memory as nightly settlement, and the failure-first experience came precisely from trusting an absolute 00:00 deadline.
- **Per-turn or per-agent-step extraction** — rejected: cost and churn without user-visible benefit over quiet-period curation.
- **Agent-owned `memory_write` tool** — promising future evolution of who writes memory, orthogonal to when background curation runs; deferred to keep this change scoped to the scheduler seam.

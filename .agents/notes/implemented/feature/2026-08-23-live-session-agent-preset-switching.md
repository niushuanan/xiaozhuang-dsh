# Agent Note: Live session agent-preset switching

Status: implemented

English | [中文](2026-08-23-live-session-agent-preset-switching.zh.md)

## Problem

The Web session header showed the active agent preset as read-only text, and `agentPreset.select` rejected every session after its first turn. Users therefore had to abandon a conversation to move between Standard, Creator, PTC, D-build, or another locally authored composition. A direct re-link during an active request would be worse: it could change tools and prompt sections underneath a turn that was already running.

## Decision

`@deepseek-ai/dsh-client-ui-agent-preset` turns the header label into the session's mode menu. An idle pick is sent immediately. A pick made while the session is running is retained in a per-session plugin store, shown as the selected mode with a "Next turn" badge, and retried when the shared session summary next reports idle. Navigation does not discard that queued choice, and selecting the current mode cancels it.

The Host changes the admission rule from blank-only to idle-only. `agentPreset.select` first serializes requests per session, then calls `Agent.runMaintenance()` to claim the idle phase before `AgentPresets.recompose()` moves the agent scope to the selected standing mount. Waking input that arrives during maintenance is latched and starts only after the re-link. An active turn or competing maintenance owner returns the existing retryable `agent-preset-locked` code, so the client keeps the choice for a later idle boundary.

Only after the re-link commits does the Host append `agent-preset/selected`. That durable fact controls resume and later turns, forwards the existing owner event to every browser tab, updates the session summary, and invalidates preset-derived command and skill catalogs. The creation header and old messages remain unchanged; the new composition governs subsequent turns.

## Alternatives considered

**Keep presets immutable after the first turn.** Rejected because it turns a routine mode change into a new-conversation workflow and loses useful conversational context.

**Cancel the running turn and switch immediately.** Rejected because the user's current task is the highest-value state. A mode choice must never discard work already in progress.

**Change only the browser label and apply the preset on the next prompt.** Rejected because every prompt entry point would then need to understand pending preset state, and other tabs or non-Web callers could race the hidden client-only decision. The Agent maintenance boundary is the single authority that already serializes waking work.

## Consequences

Existing conversations can move between shipped and custom modes without starting over. The current turn always finishes under the composition it began with; a queued switch survives header unmounts and takes effect before the next waking input. The model-visible prefix changes across the boundary, so KV-cache reuse is not expected there. Historical tool calls are not replayed or rewritten, and a deleted preset still cannot be selected or reconstructed after restart.

## Verification

Client store tests cover running-turn queueing, idle retry, stale-status locking, cancellation, owner-event confirmation, vanished sessions, transport failures, and in-flight de-duplication. Component tests drive the header menu and its queued, switching, and error states. Host tests prove an active turn and a competing maintenance owner return `agent-preset-locked`, while a completed session recomposes and records the new resolved preset. The assembled Web e2e opens a completed seeded conversation, switches it from Minimal to Standard through the real header menu, and verifies the Host session-list baseline and rendered label converge without a model call.

## Related

This note supersedes the blank-only switching decision and read-only-header choice in [per-session agent presets](../architecture/2026-08-03-per-session-agent-presets.md). The logged commit and catalog invalidation path remain the ones established by [slash catalog follows a preset switch](../bug-fix/2026-08-10-slash-catalog-follows-preset-switch.md); only the eligible boundary expands from blank to idle.

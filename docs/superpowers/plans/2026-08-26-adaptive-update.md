# Native Adaptive Update Implementation Plan

English | [中文](2026-08-26-adaptive-update.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the native “自适应更新” plugin on the latest local Xiaozhuang DSH and use that plugin to adapt the product to the latest official DSH master.

**Architecture:** A Host-and-Client plugin launches a detached stable-version worker. The worker uses separate review and candidate Git worktrees, stable headless Agents with a shadow DSH Home, deterministic candidate checks, and a stop-snapshot-switch-restart transaction with automatic code-and-data rollback.

**Tech Stack:** TypeScript, React, Cordis, Node child processes and filesystem APIs, Git worktrees, Vitest, Playwright/Web replay, CSS Modules, and macOS copy-on-write snapshots.

**Spec:** [`docs/superpowers/specs/2026-08-26-adaptive-update-design.md`](../specs/2026-08-26-adaptive-update-design.md)

## Global Constraints

- Build the plugin on local commit `d25f90205803ad5f9fa3db4b5b1aff8bdd5b5410` before merging official commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.
- Settings entry and page title are exactly “自适应更新”; the page has no introductory tagline.
- The stable current DSH performs review and adaptation; candidate code never repairs itself.
- Real DSH data is untouched before cutover, and failed cutover restores both code and data.
- Retain no completed worktree and at most one previous-data copy-on-write snapshot.

---

### Task 1: Durable operation state and owned cleanup

Write failing tests for atomic state, schema validation, one-operation ownership, and controlled cleanup before implementing `types.ts`, `state.ts`, and `retention.ts`. Cleanup removes only registered review, candidate, and shadow paths, never follows symbolic links, and retains one snapshot.

### Task 2: Repository review and plugin impact report

Use a real temporary Git repository to model a local product commit, official commit, overlapping plugin, and textual conflict. Implement bounded processes, exact-ref fetch, merge-base and diff inventory, trial merge, package mapping, and the disposable review worktree.

### Task 3: Stable Agent review and candidate adaptation

First prove the shadow Home copies only `.env`, `.credentials.yaml`, `settings.yaml`, `AGENTS.md`, and `SYSTEM.md`, excluding Sessions and attachments. Then prove with a scripted stable Agent that review and adaptation use different worktrees and adaptation never starts after review failure.

### Task 4: Deterministic validation and safe cutover

Prove that unresolved merges, any failed check, Host-only readiness, or a missing Client asset blocks cutover. Use temporary Git repositories and fake processes to verify refusal of dirty checkouts, successful advance, no duplicate launch after supervisor restart, and restoration of the old commit and data directory after readiness failure.

### Task 5: Loopback Host API and detached worker

Write failing tests for loopback-only state, single-operation start, unsupported checkout, and stale-worker recovery. Implement `/plugins/ui-adaptive-update/api/state`, `/start`, repository discovery, immutable job files, source and built worker launch, and the idle check; verify registration and disposal through real Cordis composition.

### Task 6: Native Settings page and hand-drawn icon

Pin the exact title, no tagline, idle action, review phase, impacted-plugin report, failure recovery, and completed state in component tests. Draw the 16 px open-ring and stable-core `currentColor` SVG, add it to Settings, and implement polling, dictionaries, semantic-token CSS, and slot registration.

### Task 7: Package assembly and documentation

Add the package manifest, Host and Client compiler faces, worker artifact, Web bundle row and dependency, and aggregate references. Write the bilingual package contract and Agent Note, record the borrowed concepts and rejected in-process reload, pass focused tests, types, builds, documentation, and invariant checks, then commit the plugin before merging any official code.

### Task 8: First real self-update and release checks

Start the local plugin on an isolated Web port and call its real start API. Observe the durable review while the current page remains usable, let the stable Agent adapt the official commit, require deterministic validation and shadow boot, and accept the safe cutover. Verify the same port, existing test conversation, worktree cleanup, and one-snapshot limit before updating the root README triplet and `PROJECT_CONTEXT.md`, running pre-push checks, committing, and pushing `feat/adaptive-update`.

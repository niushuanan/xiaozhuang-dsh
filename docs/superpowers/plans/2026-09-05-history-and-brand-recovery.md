# History and Brand Recovery Implementation Plan

English | [中文](2026-09-05-history-and-brand-recovery.zh.md)

> **For agentic workers:** Use systematic debugging and test-driven development for each independently owned fix; the controller integrates and verifies the complete user path.

**Goal:** Make existing imported chats and Agent conversations discoverable and readable, and restore Xiaozhuang DSH branding without altering original Session generations.

**Architecture:** Keep Session logs authoritative and use identity-checked predecessor cache values only as listing hints. Product branding belongs to the existing plugin manager's reversible sidebar slot contribution.

**Tech Stack:** TypeScript, Cordis, React, Vitest, Playwright CLI, append-only JSONL generations.

**Spec:** The user's current request to recover imported and Agent history, restore the top-left brand, and deliver one combined commit and push.

## Global Constraints

- No hash comparisons, original-log rewrites, reimports, or blanket unarchiving.
- Preserve all 18 product plugin directories and existing unrelated changes.
- Do not restart the running 3080 instance without the user's explicit approval.
- Run focused regressions and real browser acceptance; do not reinstall the workspace or run unrelated full suites.
- Commit the complete repair once; publish affected plugin copies only after the main repository push.

## Task 1: Restore historical recency

**Files:** `packages/api/session-controller/src/list.ts`, `packages/api/session-controller/tests/session-cold.host.spec.ts`, owning README pair and Agent Note.

- [x] Extend the cold-list regression with a predecessor chat created at 100 and last prompted at 1200. Verify it sorts ahead of an uncached row created at 200 without stat or body reads.
- [x] Request `sessionListMetadata` alongside `title` and `agentPreset` through display-only cached navigation; keep its sequence unknown and strict replay identities separate.
- [x] Run the cold-controller and projection-cache tests; compare real list timestamps with retained historical metadata.

## Task 2: Verify complete history and restore access

**Files:** Adjacent Session-format packages only if exact old event semantics require repair; `packages/client/ui-workspace/` only for a reproduced navigation regression.

- [x] Reconcile the 157 DeepSeek source conversations, imported persisted IDs, and backend listing.
- [x] Compare old and v2 message content without writing original records; inspect the two previously refused older Agent sessions.
- [x] For any necessary migration change, first prove the exact failure with a bounded real-data-derived fixture, then implement only verified semantics.
- [x] Open imported and old Agent conversations through the actual sidebar/search path, inspect their history, and refresh after the authorized Host restart.

## Task 3: Restore the product brand

**Files:** `plugins/plugin-manager/` client component, reversible registration, focused composition test and README pair.

- [x] Prove the installed product plugin contributes no brand to `sidebar.brand.name`.
- [x] Contribute the existing Xiaozhuang DSH name through that slot; keep upstream fallback intact when the plugin is absent.
- [x] Verify registration, rendered brand, disposal, and the actual browser header.
- [x] Restore the nine original Settings icons through a feature-owned optional slot; verify every real navigation entry and plugin disposal without adding local plugin ids to core.

## Task 4: Integrate and deliver

- [x] Review the combined diff, run focused checks, and inspect real screenshots and browser errors.
- [x] Update root README pairs and PROJECT_CONTEXT with verified outcomes and explicit remaining limitations.
- [ ] Stage only this task's changes, create one commit, and push `origin/master`; verify remote content without digest comparisons.
- [ ] Publish only impacted standalone plugin copies and clean owned temporary directories.

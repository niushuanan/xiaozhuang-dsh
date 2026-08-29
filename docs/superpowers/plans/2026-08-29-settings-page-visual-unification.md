# Settings Page Visual Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy Better Sidebar settings chrome and give every independent settings page one consistent title contract.

**Architecture:** Add one small presentational `SettingsSectionHeader` primitive in the settings domain and migrate page owners to it without moving their business actions or state. Refactor only `SideCardSection` chrome: preserve its existing controls and persistence, but replace legacy identity/group/card styling with native section/list styling and the product switch recipe.

**Tech Stack:** React, TypeScript, CSS Modules, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-29-settings-page-visual-unification-design.zh.md`

## Global Constraints

- Preserve all settings behavior, persistence routes, section registration ids, labels, and order.
- Do not touch unrelated untracked files.
- Validate visible behavior through the real `http://127.0.0.1:3080` settings flow.
- Keep tests focused on the shared header contract and the Side Card regressions named in the spec.

---

### Task 1: Shared Settings Header Contract

**Files:**
- Create: `packages/client/ui-settings/src/client/SettingsSectionHeader.tsx`
- Create: `packages/client/ui-settings/src/client/SettingsSectionHeader.module.css`
- Modify: `packages/client/ui-settings/src/client/index.ts`
- Test: `packages/client/ui-settings/tests/settings-section-header.client.spec.tsx`

**Interfaces:**
- Produces: `SettingsSectionHeader({ title, description?, actions?, titleId?, className? })`.
- Consumes: existing DSH label/background tokens only.

- [ ] **Step 1: Write the failing test**

  Assert that the shared header renders a level-two title, optional description, optional actions, and the standard data hook used by visual-contract tests.

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx vitest run packages/client/ui-settings/tests/settings-section-header.client.spec.tsx`

  Expected: FAIL because the component export does not exist.

- [ ] **Step 3: Write minimal implementation**

  Implement a semantic header whose CSS fixes title at 20px/28px/600, description at 13px/20px, zero outer margin, and a flexible right action seat.

- [ ] **Step 4: Run test to verify it passes**

  Run the same Vitest command and require zero failures.

### Task 2: Side Card Page Redesign

**Files:**
- Modify: `packages/workbench/better-sidebar/src/client/SideCardSection.tsx`
- Modify: `packages/workbench/better-sidebar/src/client/SideCardSection.module.css`
- Test: `packages/workbench/better-sidebar/tests/side-card-section.client.spec.tsx`

**Interfaces:**
- Consumes: `SettingsSectionHeader` and all existing `SideCardSection` injected services/actions.
- Produces: the same settings behavior with native header, plain sections, list rows, and unified switches.

- [ ] **Step 1: Write failing component regressions**

  Render the real section with a minimal service/store and assert: “侧边卡片” is the h2; package/version identity is absent; general/content/preview are sections; switch semantics remain accessible.

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx vitest run packages/workbench/better-sidebar/tests/side-card-section.client.spec.tsx`

  Expected: FAIL because the old page has no h2 and still renders the package identity.

- [ ] **Step 3: Replace legacy chrome only**

  Remove the version badge, render `SettingsSectionHeader`, use semantic `<section>` groups, remove group/card border containers, render counts as plain metadata, and copy the established neutral/off switch geometry while keeping the same checkbox callbacks.

- [ ] **Step 4: Run test to verify it passes**

  Run the same Vitest command and require zero failures.

### Task 3: Migrate Independent Settings Page Titles

**Files:**
- Modify: independent settings section components that currently own an h2 under `packages/client/ui-*`.
- Modify: their CSS modules only where old title/header padding conflicts with the shared contract.
- Test: targeted existing component tests plus a source-level contract test under `packages/client/ui-settings/tests/`.

**Interfaces:**
- Consumes: `SettingsSectionHeader`.
- Produces: consistent top-title geometry while preserving page-specific controls, scroll ownership, and dynamic labels.

- [ ] **Step 1: Write a failing migration contract test**

  Enumerate the shipped independent settings page sources and assert they import/render the shared header instead of locally styling their main h2.

- [ ] **Step 2: Run test to verify it fails**

  Run the focused contract test and confirm failures name the unmigrated pages.

- [ ] **Step 3: Migrate each page minimally**

  Replace only top header markup/style; pass existing title, intro, id and right-side actions into the shared component. Keep special full-height workspaces and page bodies unchanged.

- [ ] **Step 4: Run focused tests and type checks**

  Run the contract test, directly affected package tests, and package-scoped TypeScript checks.

### Task 4: Context and Real Product Verification

**Files:**
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: final diff and verified behavior.
- Produces: current project handoff evidence.

- [ ] **Step 1: Reassess PROJECT_CONTEXT sections 1–3**

  Confirm project purpose, structure, and entry points are unchanged.

- [ ] **Step 2: Append the dated change record**

  Record task, files, behavior, rationale, affected modules, and verification evidence.

- [ ] **Step 3: Run fresh verification**

  Run focused Vitest, affected TypeScript/bundle checks, and `git diff --check`.

- [ ] **Step 4: Validate 3080 through the real path**

  Reload the latest source, open Settings, inspect multiple sections, operate Side Card switches/disclosures, and confirm no browser console errors.

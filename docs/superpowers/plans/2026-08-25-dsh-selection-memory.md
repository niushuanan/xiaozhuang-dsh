# Native DSH Selection Actions and Memory System Implementation Plan

English | [中文](2026-08-25-dsh-selection-memory.zh.md)

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Deliver two independently switchable native DSH plugins, Selection Actions and Memory System, covering selection quotes, AI-curated explicit memory, two-document editing, daily maintenance, and relevant recall.

**Architecture:** The `memory-system` Host and Client plugin owns fixed global documents, model maintenance, conversation scanning, recall, and Settings. The `ui-selection-actions` Client plugin owns the selection popover and quote-to-new-conversation flow. Quote reuses DSH Input Trigger's hidden serialization, session creation reuses Workspace and Session Runtime, and the multi-conversation plugin exposes a callable coordinator service.

**Tech Stack:** TypeScript, React, Cordis, DSH LLM/Session Query/Client Runtime, Vitest, and CSS Modules.

---

### Task 1: Native service seam

**Files:**
- Modify: `packages/client/ui-multi-window/src/client/index.ts`
- Modify: `packages/client/ui-multi-window/src/client/coordinator.ts`
- Test: `packages/client/ui-multi-window/tests/coordinator.client.spec.ts`

Write the test first. Expose the minimal `multiPane.openSession(id)` Client service from the multi-conversation plugin and ensure it disappears on unload, without changing the existing menu or split-pane behavior.

### Task 2: Memory domain and fixed document storage

**Files:**
- Create: `packages/memory/memory-system/src/domain.ts`
- Create: `packages/memory/memory-system/src/store.ts`
- Create: `packages/memory/memory-system/tests/domain.spec.ts`
- Create: `packages/memory/memory-system/tests/store.host.spec.ts`

Write failing tests first for the two documents, revisions, cursor, atomic save, restore, sensitive-content guard, relevant excerpt retrieval, and priority. Files stay under a fixed DSH Home path and never accept arbitrary paths.

### Task 3: Model maintenance, daily scanning, and Agent recall

**Files:**
- Create: `packages/memory/memory-system/src/model.ts`
- Create: `packages/memory/memory-system/src/maintenance.ts`
- Create: `packages/memory/memory-system/src/index.ts`
- Test: `packages/memory/memory-system/tests/model.spec.ts`
- Test: `packages/memory/memory-system/tests/maintenance.spec.ts`

Reuse the current session's model route and Session Query. Explicit Remember requests maintain User Memory, local 12:00 maintenance updates AI Memory, and only success advances the cursor. `agent/pre-step` appends only relevant, low-authority reference context.

### Task 4: Two-document Settings page

**Files:**
- Create: `packages/memory/memory-system/src/client/index.ts`
- Create: `packages/memory/memory-system/src/client/MemorySettings.tsx`
- Create: `packages/memory/memory-system/src/client/MemorySettings.module.css`
- Test: `packages/memory/memory-system/tests/memory-settings.client.spec.tsx`

Write component tests first, then implement the two tabs, edit and save, conflict refresh, previous-revision restore, latest maintenance status, and error feedback.

### Task 5: Selection quotes and explicit memory

**Files:**
- Create: `packages/client/ui-selection-actions/src/client/selection.ts`
- Create: `packages/client/ui-selection-actions/src/client/reference.ts`
- Create: `packages/client/ui-selection-actions/src/client/SelectionActions.tsx`
- Create: `packages/client/ui-selection-actions/src/client/index.ts`
- Modify: `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`
- Test: `packages/client/ui-selection-actions/tests/selection.client.spec.tsx`

Write the user-path tests first. Accept only a nonempty selection inside a DSH conversation and show exactly two actions. Quote creates a same-workspace conversation, inserts a reference occurrence, opens it beside the source without sending, and Remember sends a bounded selection packet and displays the result.

### Task 6: Assembly, Plugin Center, and browser bridge protocol

**Files:**
- Modify: `packages/bundle/web-app/package.json`
- Modify: `packages/bundle/web-app/cordis.patch.yml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`
- Modify: `tsconfig.client.json`
- Modify: `packages/computer-use/computer-use/assets/browser-bridge/service-worker.js`
- Modify: `~/.dsh/profiles/web/cordis.patch.yml`
- Modify: `~/.dsh/profiles/web/packages/xiaozhuang-plugins/lib/index.js`
- Modify: `~/.dsh/profiles/web/packages/xiaozhuang-plugins/lib/client.js`

Register two independent Loader entries and Plugin Center rows, then add the same selection packet protocol to Chrome Bridge. Modify only the current local native profile and do not create a parallel application.

### Task 7: Documentation, builds, and real acceptance

**Files:**
- Create: README triplets for both packages
- Modify: root `README.md`, `README.zh.md`, and `README.i18n.yaml`
- Modify: `PROJECT_CONTEXT.md`

Run focused Vitest suites, relevant TypeScript project builds, and bundle and README gates. Finally, use `http://127.0.0.1:3080` to validate selection, quote-to-new-pane, memory writing, and two-document editing through the real user path, then audit the final diff without committing or pushing.

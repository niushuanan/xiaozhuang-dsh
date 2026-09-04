# Removable Product Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the product to `dsh-v0.1.3-alpha.1` while preserving the Xiaozhuang frontend and functions in 18 independently removable native plugin folders.

**Architecture:** Start from the upstream target core, add a generic directory-discovered bundle layer and neutral UI registries, then move each local capability into one self-contained `plugins/<id>/` boundary. The official product remains the fallback for every optional UI seat and for zero-plugin startup.

**Tech Stack:** TypeScript, Cordis Loader, React, Vite, pnpm workspaces, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-removable-product-plugins.md`

## Global Constraints

- The upstream target is `dsh-v0.1.3-alpha.1`.
- All-installed behavior and presentation match the captured pre-upgrade product baseline.
- Deleting one plugin folder cannot break another plugin or the official Web product.
- Deleting all plugin folders leaves the official Web product usable.
- Root manifests, Web bundle patches, and TypeScript project references contain no Xiaozhuang plugin name or path.
- No product plugin has a runtime or package dependency on another product plugin.
- Stored plugin settings and user data remain intact while code is absent.
- No implementation or verification step compares hash values.

---

### Task 1: Integrate the upstream target core

**Files:**
- Merge source: named tag `dsh-v0.1.3-alpha.1`
- Preserve: `docs/superpowers/specs/2026-09-04-removable-product-plugins.md`
- Preserve: `docs/superpowers/plans/2026-09-04-removable-product-plugins.md`

**Interfaces:**
- Consumes: current Xiaozhuang `master` history and the named upstream tag.
- Produces: a branch whose core files match the target except for explicitly listed neutral extension files.

- [ ] **Step 1: Record the current local-only feature paths by name**

Run: `git diff --name-status dsh-v0.1.3-alpha.1..master -- packages | sed -n '1,240p'`

Expected: a named path inventory used to recover local plugin source without inspecting or comparing commit identifiers.

- [ ] **Step 2: Merge the named target tag**

Run: `git merge --no-commit dsh-v0.1.3-alpha.1`

Expected: merge conflicts are limited to the known divergent core and package files.

- [ ] **Step 3: Resolve target-owned core to the tag content**

For every conflict outside local capability source, select the `dsh-v0.1.3-alpha.1` side by path. Preserve only the two approved Superpowers documents and the local feature source that will move under `plugins/`.

- [ ] **Step 4: Verify the upstream core baseline**

Run: `git diff --name-only dsh-v0.1.3-alpha.1 -- apps packages scripts | rg -v '^(apps/cli/src/product-plugin|packages/client/.*/(contract/slots|.*Root|InputBar|ConversationSession)|packages/core/session/)'`

Expected: no unexplained product-core deviations remain.

- [ ] **Step 5: Commit the integration checkpoint**

Run: `git add -u && git add docs/superpowers && git commit -m "chore: integrate dsh v0.1.3 alpha core"`

### Task 2: Discover native product bundles by directory

**Files:**
- Create: `apps/cli/src/product-plugin-directory.ts`
- Modify: `apps/cli/src/profile-boot.ts`
- Modify: `apps/cli/package.json`
- Modify: `pnpm-workspace.yaml`
- Create: `apps/cli/tests/product-plugin-directory.spec.ts`
- Create: `scripts/product-plugins.ts`
- Create: `scripts/product-plugins.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `discoverProductPluginBundles(root: string): Promise<readonly ProductPluginBundle[]>`.
- Produces: `ProductPluginBundle { id: string; directory: string; manifestPath: string; patchPath: string }` and ordered patch paths for profile boot/build/watch.

- [ ] **Step 1: Write discovery red tests**

Create fixtures for an absent directory, an empty directory, two valid child manifests, one removed child, and one invalid patch path. Assert that valid results are lexical, absence is empty, deletion removes the result, and invalid present folders report their path.

- [ ] **Step 2: Run the discovery tests and observe missing exports**

Run: `pnpm exec vitest run apps/cli/tests/product-plugin-directory.spec.ts`

Expected: FAIL because `discoverProductPluginBundles` does not exist.

- [ ] **Step 3: Implement the minimal scanner**

Implement this public contract:

```ts
export interface ProductPluginBundle {
  readonly id: string
  readonly directory: string
  readonly manifestPath: string
  readonly patchPath: string
}

export async function discoverProductPluginBundles(
  root: string,
): Promise<readonly ProductPluginBundle[]>
```

Read only direct children, require `package.json` with a non-empty `name` and `dsh.bundle.patch`, resolve the patch inside the child directory, and return lexical folder order.

- [ ] **Step 4: Make profile boot append discovered bundle patches**

Resolve the directory from `DSH_PRODUCT_PLUGINS_DIR` or the repository `plugins/` folder. Append its patches after official bundle layers and before user/home/CLI overlays so user configuration keeps final authority.

- [ ] **Step 5: Add generic build and watch commands**

`scripts/product-plugins.ts` scans the same folders, executes each package's `bundle` script, and in watch mode restarts discovery when a direct child or manifest changes. Add `product-plugins:build`, `product-plugins:watch`, and include the build in the product Web build path.

- [ ] **Step 6: Verify green and commit**

Run: `pnpm exec vitest run apps/cli/tests/product-plugin-directory.spec.ts scripts/product-plugins.spec.ts packages/boot/app-boot/tests/profile.spec.ts`

Run: `git add apps/cli scripts package.json pnpm-workspace.yaml && git commit -m "feat: discover product plugin bundles by directory"`

### Task 3: Add neutral UI and session extension points

**Files:**
- Modify: `packages/client/ui-sidebar/src/client/contract/slots.ts`
- Modify: `packages/client/ui-sidebar/src/client/SidebarRoot.tsx`
- Modify: `packages/client/ui-conversation/src/client/contract/slots.ts`
- Modify: `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx`
- Modify: `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx`
- Modify: `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`
- Modify: `packages/client/ui-chat/src/client/conversation-nodes/common.ts`
- Modify: `packages/core/session/src/types.ts`
- Modify: `packages/core/session/src/index.ts`
- Test: corresponding package tests under `packages/client/ui-sidebar/tests/`, `packages/client/ui-conversation/tests/`, `packages/client/ui-chat/tests/`, and `packages/core/session/tests/`

**Interfaces:**
- Consumes: existing `@deepseek-ai/dsh-client-ui-slots` effect-owned slot registry.
- Produces: the seven neutral seats/registries named in the design and `Session.appendExternal(type, data, { ignorable: true })` for external informational events.

- [ ] **Step 1: Write failing fallback and disposal tests**

Assert the official sidebar and input actions render with no contribution, one replacement owns each single seat, list seats preserve priority, and disposing a contributing fiber restores the official fallback.

- [ ] **Step 2: Run the UI red tests**

Run: `pnpm exec vitest run packages/client/ui-sidebar/tests packages/client/ui-conversation/tests/assembly-surfaces.client.spec.tsx packages/client/ui-conversation/tests/input-bar.client.spec.tsx`

Expected: FAIL on the new seat keys and fallback expectations.

- [ ] **Step 3: Implement the seats and registries**

Use existing slot registration effects. Keep official labels and action implementations as fallbacks. Add stable `data-dsh-session-id`, `data-dsh-message`, and `data-dsh-message-seq` attributes to their semantic owning elements.

- [ ] **Step 4: Write and run the external-event red test**

Assert an external informational event is appended with `ignorable: true`, survives same-version persistence, and does not add its type to the first-party event map.

Run: `pnpm exec vitest run packages/core/session/tests`

Expected: FAIL because the public append API has no external informational form.

- [ ] **Step 5: Implement the narrow append API and verify green**

The API accepts only `{ ignorable: true }`, writes the standard envelope marker, and leaves typed `append()` unchanged for first-party events.

Run: `pnpm exec vitest run packages/client/ui-sidebar/tests packages/client/ui-conversation/tests packages/client/ui-chat/tests packages/core/session/tests`

- [ ] **Step 6: Commit**

Run: `git add packages/client/ui-sidebar packages/client/ui-conversation packages/client/ui-chat packages/core/session && git commit -m "feat: add neutral removable plugin extension points"`

### Task 4: Establish self-contained plugin package boundaries

**Files:**
- Create: `plugins/<id>/package.json` for all 18 identifiers in the design.
- Create: `plugins/<id>/cordis.patch.yml` for all 18 identifiers.
- Move: local plugin source, tests, assets, presets, and README files into the owning folder.
- Remove: Xiaozhuang rows from `packages/bundle/web-app/cordis.patch.yml`.
- Remove: Xiaozhuang package dependencies from `packages/bundle/web-app/package.json`.
- Remove: Xiaozhuang references from root TypeScript configurations.
- Create: `scripts/product-plugin-boundaries.spec.ts`

**Interfaces:**
- Consumes: generic plugin discovery and official DSH packages.
- Produces: 18 independent deletion boundaries, each with one native bundle patch.

- [ ] **Step 1: Write the boundary red test**

Build a temporary repository view from the real manifests. Assert exactly 18 direct plugin folders, a valid local patch per folder, no cross-plugin dependency/import, and no plugin identifiers in root app manifests, Web patch, or root project references.

- [ ] **Step 2: Run the boundary test**

Run: `pnpm exec vitest run scripts/product-plugin-boundaries.spec.ts`

Expected: FAIL because the local features are still statically wired under `packages/`.

- [ ] **Step 3: Move capability owners one folder at a time**

Use `git mv` for tracked source and retain package names, settings namespaces, routes, localized copy, CSS classes, assets, and tests. Give every root plugin manifest this native declaration:

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

- [ ] **Step 4: Remove static assembly references**

The official Web bundle contains no Xiaozhuang row. Generic workspace globs discover present plugin folders; product plugin builds are not root TypeScript project references.

- [ ] **Step 5: Verify and commit the structural slice**

Run: `pnpm exec vitest run scripts/product-plugin-boundaries.spec.ts apps/cli/tests/product-plugin-directory.spec.ts`

Run: `git add plugins packages/bundle pnpm-workspace.yaml scripts && git commit -m "refactor: isolate product plugins by folder"`

### Task 5: Adapt user-visible plugins to the upstream contracts

**Files:**
- Modify: source and tests inside each `plugins/<id>/` folder.
- Modify only when required: neutral extension owners from Task 3.

**Interfaces:**
- Consumes: target client modules, Host remotes, settings, slots, and neutral seats.
- Produces: unchanged Xiaozhuang screens and actions on the upstream runtime.

- [ ] **Step 1: Port low-coupling plugins with their existing tests**

Port `fluent-output`, `model-usage`, `runtime-pulse`, `token-overview`, `session-modes`, `vision`, and `conversation-import`. For each folder, first run its moved tests against the target contracts, observe the failing import or behavior, then make only the compatibility edits required for green.

- [ ] **Step 2: Port settings and shell plugins**

Port `memory-system`, `skill-manager`, `product-companion`, `adaptive-update`, and `better-sidebar`, retaining settings keys, routes, labels, assets, and action order.

- [ ] **Step 3: Port conversation interaction plugins**

Port `chat-mode`, `multi-window`, and `selection-actions` onto the neutral registries. Remove the package dependency from `selection-actions` to `multi-window`; feature-detect the auxiliary-pane opener and omit only the side-chat action when absent.

- [ ] **Step 4: Reconstruct complete Teamwork and parallel development source**

Move all Teamwork providers beneath `plugins/teamwork/packages/`, reconstruct source for profile-only built packages, and emit Teamwork informational events through the ignorable external append API. Move parallel-development source into its folder and retain its user workflow.

- [ ] **Step 5: Replace hash comparisons in Git automation**

Use named baseline refs, `git status --porcelain`, named-ref ancestry, and ahead/behind counts in `parallel-development` and `adaptive-update`. Use random run directory names. Keep existing Git UI display fields unchanged.

- [ ] **Step 6: Run each moved package's focused tests and commit in functional groups**

Run: `pnpm exec vitest run plugins/<id>/tests`

Expected: every existing high-value behavior test passes from its new owner folder.

### Task 6: Make the plugin manager independently removable

**Files:**
- Move/Create: `plugins/plugin-manager/`
- Test: `plugins/plugin-manager/tests/catalog.client.spec.tsx`
- Test: `plugins/plugin-manager/tests/export.host.spec.ts`

**Interfaces:**
- Consumes: generic discovery output and official Loader inventory/settings APIs.
- Produces: the existing plugin catalog, enable controls, and selective export without owning startup composition.

- [ ] **Step 1: Write the removal red test**

Boot a composition without `plugins/plugin-manager/` and assert official Settings still renders while a second product plugin is present and active.

- [ ] **Step 2: Run and observe the central-manager dependency**

Run: `pnpm exec vitest run plugins/plugin-manager/tests`

Expected: FAIL until discovery and controls no longer require the manager row.

- [ ] **Step 3: Move catalog metadata into plugin manifests**

Read name, description, category, settings link, and export files from each present plugin's manifest. The manager presents this metadata but does not maintain a closed registry or central enable rows.

- [ ] **Step 4: Verify manager-present and manager-absent compositions**

Run: `pnpm exec vitest run plugins/plugin-manager/tests apps/cli/tests/product-plugin-directory.spec.ts`

- [ ] **Step 5: Commit**

Run: `git add plugins/plugin-manager plugins/*/package.json && git commit -m "feat: make plugin manager a removable observer"`

### Task 7: Prove folder-deletion behavior

**Files:**
- Create: `scripts/verify-product-plugin-removal.ts`
- Create: `scripts/verify-product-plugin-removal.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the real scanner, build command, and Web profile composition.
- Produces: a deletion matrix report for all-installed, each single removal, and zero-plugin cases.

- [ ] **Step 1: Write the deletion-harness red test**

Copy only plugin folders into a temporary root, remove a selected folder, invoke discovery and profile dump, and assert no row or module from the removed folder remains while official rows remain.

- [ ] **Step 2: Run red**

Run: `pnpm exec vitest run scripts/verify-product-plugin-removal.spec.ts`

Expected: FAIL until the real matrix runner exists.

- [ ] **Step 3: Implement the matrix runner**

Use temporary directories and recoverable copies. Never delete from the working `plugins/` tree. For each case run discovery, build the remaining product plugins, dump the Web composition, and execute a no-open Web smoke on an available test port.

- [ ] **Step 4: Run the complete matrix**

Run: `pnpm run verify:product-plugin-removal`

Expected: all-installed, 18 single-removal cases, and zero-plugin core succeed with no dangling row.

- [ ] **Step 5: Commit**

Run: `git add scripts package.json && git commit -m "test: verify every product plugin removal boundary"`

### Task 8: Document the shipped architecture

**Files:**
- Create: `.agents/notes/implemented/architecture/2026-09-04-directory-discovered-product-plugins.md`
- Create: matching `.zh.md` and `.i18n.yaml`
- Modify: `docs/architecture.md`
- Modify: `docs/architecture.zh.md`
- Modify: affected package and plugin READMEs.

**Interfaces:**
- Consumes: the implementation that actually shipped.
- Produces: present-tense architecture and maintainer rationale.

- [ ] **Step 1: Write the implemented Agent Note from actual code**

Use the required `Problem`, `Decision`, `Alternatives considered`, and `Consequences` sections. Record folder ownership, discovery order, fallback behavior, and the no-cross-plugin-dependency rule.

- [ ] **Step 2: Update current-state architecture and package docs**

Document the generic directory layer and neutral UI registries at their owning tiers. Keep product-plugin details in each plugin README.

- [ ] **Step 3: Run documentation checks**

Run: `pnpm run verify-agent-note-format && pnpm run verify-md-links && pnpm run verify-md-wrap && pnpm run verify-translation-pairing`

- [ ] **Step 4: Commit**

Run: `git add .agents/notes docs plugins/*/README* && git commit -m "docs: record removable product plugin architecture"`

### Task 9: Run automated and real-browser acceptance

**Files:**
- Evidence: `output/playwright/upstream-upgrade-final/`
- No production file changes unless a failing user path first receives a regression test.

**Interfaces:**
- Consumes: final candidate build and the 14 pre-upgrade screenshots.
- Produces: fresh build/test logs, real interactions, and matching post-upgrade screenshots.

- [ ] **Step 1: Run focused regressions and build**

Run the baseline 25 plugin test files, all new discovery/boundary/removal tests, `pnpm run typecheck`, and `pnpm run build`.

- [ ] **Step 2: Start the candidate with copied user data on a separate port**

Use a temporary Harness home copied from the live profile and `--no-open`; never run a second scheduler or bot. Confirm the candidate serves the Web entry and uses only the copied data root.

- [ ] **Step 3: Repeat every captured user path**

Use Playwright to exercise Home, catalog, Skill Manager, import, presets, Teamwork, token overview, memory, companion, adaptive update, better-sidebar, chat mode, multi-window, composer add, and selection actions. Save a screenshot after each observable terminal state.

- [ ] **Step 4: Fix any mismatch through red-green cycles**

For every mismatch, add the narrowest behavior test that fails for the observed reason, implement the smallest correction, rerun that test, and repeat the same browser path.

- [ ] **Step 5: Verify worktree cleanliness and commit final fixes**

Run: `git status --short`

Expected: clean after committing all verified implementation and evidence records that belong in source control.

### Task 10: Merge locally, verify master, and clean the worktree

**Files:**
- Modify after merge: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: verified feature branch and user-confirmed local merge choice.
- Produces: committed local `master` and no remaining isolated worktree or feature branch.

- [ ] **Step 1: Stop candidate-only processes**

Identify listeners by working directory and stop only processes launched from the isolated worktree.

- [ ] **Step 2: Merge into local `master` without disturbing existing user files**

Return to the main checkout, ensure only the previously observed `PROJECT_CONTEXT.md` change and untracked user artifacts remain, then merge the feature branch locally. Do not stage unrelated untracked paths.

- [ ] **Step 3: Update project context from the merged reality**

Refresh sections 1–3 for the new `plugins/` topology and append a minute-granularity entry under `## 4. 最近改了什么` listing the task, files, reason, and affected modules.

- [ ] **Step 4: Commit the merged result on `master`**

Stage only the merge result and intended `PROJECT_CONTEXT.md`; commit locally. Do not push.

- [ ] **Step 5: Re-run the high-value merged-tree checks and live product path**

Run the focused suite, typecheck/build, deletion matrix, and a 3080 real-browser smoke after the single live service has restarted from `master`.

- [ ] **Step 6: Remove the clean isolated worktree and feature branch**

Require an empty `git status --short` in the isolated tree, remove it with `git worktree remove`, prune the registration, delete the merged feature branch, and verify both the directory and registration are absent.

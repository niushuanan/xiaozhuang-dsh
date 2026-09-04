# Removable Product Plugins Design

Status: approved

## Goal

Upgrade Xiaozhuang DSH to the `dsh-v0.1.3-alpha.1` upstream product while preserving every existing local plugin's visible UI and user function, and make each product plugin removable by deleting exactly one folder.

## Product requirements

- The upstream target is `dsh-v0.1.3-alpha.1`.
- Upstream owns the product core; Xiaozhuang behavior lives in native Cordis bundles under `plugins/`.
- All-installed behavior and presentation match the captured pre-upgrade product baseline.
- Removing one plugin folder leaves every other plugin and the official Web product usable.
- Removing all plugin folders leaves the official Web product usable.
- The plugin manager is itself a removable plugin and is not required for discovery or startup.
- Stored settings and plugin-owned user data remain inert while a plugin is absent and become usable again if the folder returns.
- Implementation and verification do not compare hash values.

## Directory ownership

Each independently removable product capability owns one top-level folder:

```text
plugins/
  adaptive-update/
  better-sidebar/
  chat-mode/
  conversation-import/
  fluent-output/
  memory-system/
  model-usage/
  multi-window/
  parallel-development/
  plugin-manager/
  product-companion/
  runtime-pulse/
  selection-actions/
  session-modes/
  skill-manager/
  teamwork/
  token-overview/
  vision/
```

Every folder contains its package manifest, source, tests, assets, bundle patch, and any private nested packages required by that feature. A plugin may depend on official DSH capabilities, Cordis, React, and ordinary libraries. It may not import or declare a runtime dependency on another folder in `plugins/`.

## Discovery and composition

The CLI owns a neutral product-plugin-directory step before profile boot. It resolves `plugins/` relative to the repository or an explicit `DSH_PRODUCT_PLUGINS_DIR`, scans direct child folders in lexical order, validates each `package.json` and `dsh.bundle.patch`, and appends the discovered bundle patches as normal profile layers. Missing `plugins/`, an empty directory, or a removed child is a valid composition.

Discovery has no plugin identifier registry. The folder and manifest are the source of truth. Invalid manifests fail at startup with the folder path and actionable reason; absent folders do not leave configuration rows behind.

Development build and watch commands use the same discovery result. The root workspace uses generic `plugins/*` and `plugins/*/packages/*` globs. Root application manifests, Web bundle patches, and root TypeScript project references contain no Xiaozhuang plugin name or plugin path.

The running development supervisor watches direct child presence and manifest changes. A change triggers a clean plugin rebuild and process restart, so raw folder deletion converges to the same composition as a fresh start. Production startup performs one scan and requires a normal restart after filesystem changes.

## Neutral core extension points

The upstream UI receives only reusable extension points with official fallbacks:

- `sidebar.primary.action`: one replacement seat whose fallback is the official new-session action.
- `conversation.input.add`: one replacement seat whose fallback is the official attachment action.
- `conversation.hero.actions`: ordered optional actions beside the empty-conversation hero.
- `conversation.session.panes`: ordered optional auxiliary panes associated with a session.
- `sidebar.workspaces.sessionMenuAction`: ordered optional actions for a session menu.
- `conversation.presentation`: a registry that may classify a session, hide irrelevant workspace controls, and provide an empty-state presentation.
- `sidebar.sessionGroups`: a registry that may claim sessions for an additional sidebar group.

The extension-point packages contain no Xiaozhuang plugin identifiers, labels, assets, or routes. Contributions are Cordis effects and disappear when their owning plugin unloads. The official fallback remains when no contribution exists.

The official conversation DOM exposes stable semantic data attributes for the current session and message rows. These attributes carry no local feature behavior; they allow optional selection tooling to locate the selected message without importing the conversation implementation.

## Plugin interactions

Optional cooperation uses neutral services or feature detection. `selection-actions` registers its reference and rewrite actions unconditionally. It adds the side-chat action only when a generic auxiliary-pane opener is available. Removing `multi-window` therefore removes only that one optional action and does not prevent `selection-actions` from loading.

No other plugin requires another product plugin. Teamwork's internal packages remain private to `plugins/teamwork/` and are composed by its own bundle.

## Durable data

Plugin settings retain their existing namespaces and values. The generic settings store may keep unknown namespaces while a plugin is absent.

Teamwork records informational state with `ignorable: true` on the durable event envelope. The official reader may omit that event when the Teamwork folder is absent, while required unknown events still fail closed. The public append API exposes this marker without teaching the core a Teamwork event name.

Memory documents, imported conversations, skills, and workbench files remain user-owned data and are never deleted by plugin removal. Removing a plugin folder removes code and active registrations, not user data.

## No-hash Git behavior

Parallel development creates a unique named baseline ref for each run and addresses worktrees, comparisons, and review prompts through named refs. It detects an unchanged branch with status and named-ref ancestry/count checks rather than reading or comparing commit identifiers. Run directories use random names.

Adaptive update records named release refs and branch state. It uses named-ref ancestry and ahead/behind counts for safety decisions. Existing Git UI may display commit identifiers as repository content, but product code does not compare them to decide an operation.

## Acceptance

Automated acceptance covers core-only startup, all-installed startup, each of the 18 single-folder removals, and zero-plugin startup. For each case the process must build, compose, and serve the official health and Web entry routes without a missing-package or dangling-row error.

All-installed browser acceptance repeats the captured user paths for Home, plugin catalog, Skill Manager, conversation import, agent presets, Teamwork, token overview, memory, product companion, adaptive update, better-sidebar settings, chat mode, multi-window, composer add, and selection actions. Screenshots and interaction results are compared by visible behavior and layout, never by hash value.

The final integration is committed locally on `master`. The isolated worktree is removed only after the merged tree passes the same high-value automated and real-browser checks and the worktree reports no uncommitted files.

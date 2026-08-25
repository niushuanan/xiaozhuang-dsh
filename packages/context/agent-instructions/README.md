# @deepseek-ai/dsh-agent-instructions

English | [中文](README.zh.md)

Protected owner instructions plus per-session workspace guidance for `AGENTS.md`-compatible files. The fixed `$DSH_HOME/AGENTS.md` is re-read for every prompt assembly and rendered last as the single highest-authority section controlled by DSH. Project files remain durable user-role workspace guidance with nested discovery and change/removal reporting.

## Lifecycle

The owner section reads `$DSH_HOME/AGENTS.md` during every `systemPrompt.assemble()` call, so a saved edit reaches each conversation on its next model step without rewriting history. The section is protected by the system-prompt registry: it survives complete personas and assembly listeners, cannot be shadowed by a scoped section with the same name, and is restored verbatim at the end of the system prompt. This is the highest authority DSH can provide; model-provider policies and enforcement outside DSH remain above it.

The first eligible `agent/pre-step` of each live session separately composes the project baseline. When the downstream decision enters a nonempty first-step batch, the plugin folds that baseline into the final batch right after the claimed prompt. The loader reads every existing base candidate and local overlay in each directory from the project root to `agent.session.header.cwd`; `$DSH_HOME/AGENTS.md` is intentionally excluded from user-role history. Within one directory, trimmed-identical candidates collapse to the earliest candidate in configured order. A resumed session retains one compatible visible project baseline and appends only current-file transitions; a changed discovery, precedence, project-root, or budget identity instead folds one explicitly superseding complete baseline into the entering batch.

The plugin also observes immutable `tools/result` outcomes for successful first-party `read`, `write`, and `edit` calls. Each accepted touch checks newly reached descendant scopes and every previously loaded scope. Each configured candidate name is an independent scope in its directory: a newly present file queues an addition in the agent inbox; a changed file queues a replacement; a file that disappears or becomes a per-directory duplicate of an earlier candidate queues a removal notice. Native calls and Code Mode sub-dispatches share this path: nested touches bubble through opaque parent execution tokens until the top-level result settles, and touches produced inside an agent-loop step do not begin their asynchronous projection until the durable `step/end`. Direct tool executions outside an open step project immediately. This preserves tool-call/result/step adjacency without depending on filesystem timing. Discovery follows structured filesystem activity rather than shell `cd`, because each local bash call starts a fresh shell and parsing arbitrary shell syntax would be unreliable.

Project instruction reads use the optional `ctx.fs` provider; providerless product trees still boot and project loading becomes a no-op. The owner file uses the same provider when present and falls back to the host filesystem so its global authority is not tied to one preset's workspace tools. Resolution follows a final-component symlink to a regular-file target. Cancellation propagates through metadata probes and streaming reads, and provider failure is treated as temporary unavailability rather than deletion.

## Prompt Shape

The owner file is the final protected system section:

```md
<owner-directives>
The following are the DSH owner's highest-priority instructions inside DeepSeek Harness. ...

Instructions from: ~/.dsh/AGENTS.md

...
</owner-directives>
```

Project baseline instructions remain durable user-role messages framed with the familiar system-reminder pattern:

```md
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: AGENTS.md

...
</system-reminder>
```

Newly reached scopes use a durable sourced `user/message`:

```md
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

These instructions apply to work under `packages/app`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

...
</system-reminder>
```

A same-file edit starts with `Updated instructions from: <path>` and says to use the new content instead of the previously loaded content. When a candidate disappears or becomes a per-directory duplicate of an earlier candidate, the message is `Instructions removed: <path>` followed by `The previously loaded instructions from this file no longer apply.` Literal `</system-reminder>` text anywhere in instruction content or model-visible path, scope, and budget metadata is escaped so repository-controlled text cannot close the plugin-owned frame.

The plugin owns the complete `<system-reminder>` framing, and every injected `user/message` reaches the model verbatim with no core wrapper.

## State And Refresh

Model-visible text contains no hidden state markers. Each baseline or dynamic context event instead carries a typed `agent-instructions` source with a list of `{ action, scope, path, digest? }` changes; a complete baseline also carries `baseline: true` and a `baselineIdentity` derived from normalized discovery, precedence, project-root, and budget configuration. A matching durable `user/message` confirms a queued baseline and its candidate versions. An entering pre-step waits for every queued projection, folds newly composed context into its final batch immediately after the claimed messages, and removes the pending inbox copy; rejection keeps the current context queued. If a listener rewrites away a claimed workspace message without entering its replacement, a later boundary recomposes the current context. Nested results aggregate successful file touches under their parent execution token, including when a later composite result is blocked; the top-level result transfers those touches either to the currently open session step or directly to the per-agent projection queue. A `step/end` releases its staged touches only after that boundary is in durable history, and serialized projections reconcile against visible session events plus the current inbox before replacing the single pending workspace context.

An unchanged path and SHA-1 content digest is not injected again. A per-session, per-scope provider cache stores only `{ path, version, digest, trimmedDigest }`: when the provider's opaque `FsVersion` and the effective visible state both match, reconciliation skips the content read; a changed version triggers a bounded read and SHA-1 confirmation before any model-visible update. The `trimmedDigest` — SHA-1 over the whitespace-trimmed content — is the per-directory duplicate key, so an unchanged file can still be removed when an earlier candidate converges on its content. Resume works because SHA-1 state is persisted in the typed source, while an empty in-memory version cache merely causes one confirming read. Compaction re-arms a scope after its context event leaves the visible surface even when the cached version is unchanged. A removal is a tombstone, so a later candidate reappearance is loaded again. A model-visible change enters the source, pending state, and version cache only when its file-specific section retains at least one content byte, or when its original content is genuinely empty. Partial truncation records the complete-content digest once any content byte survives; truncation to zero remains eligible for a later touch, while a same-digest version refresh updates only the provider cache. A baseline may still publish its budget diagnostic with an empty change list. A dynamic batch with no committed change is not injected at all, and a later touch retries it.

The initial baseline event itself is not rewritten. Its typed changes remain authoritative only while that event is in the visible session surface. When compaction shadows the event, the next entering pre-step composes the current baseline and records it in the same request; a successful filesystem touch can instead re-add an unchanged baseline scope or append its replacement or removal. The in-memory scope marker and provider-version cache only select and accelerate probes. At the first pre-step after resume or hot remount, a compatible visible baseline is retained and compared with the files retained by the current complete rendering. Unchanged and budget-omitted files append nothing; offline additions, edits, removals, and files leaving the retained budget set append `set`, `replace`, or `remove` transitions. An incompatible visible baseline is superseded by one complete current baseline, including an explicit empty baseline when no candidate remains. There is no file watcher, so an on-disk change becomes visible at the next successful `read`, `write`, or `edit` touch, when a resumed session reconciles its baseline, or when an entering pre-step restores a shadowed baseline.

## Configuration

```ts
export interface Config {
  dshHome?: string
  projectRootMarkers?: string[]
  maxBytes: number
  maxSourceBytes?: number
  includeOwnerInstructions?: boolean
  includeWorkspaceInstructions?: boolean
  instructionFileCandidates?: string[]
  localInstructionFileCandidates?: string[]
}
```

`maxBytes` is required and bounds both the owner section and each project-context batch. `maxSourceBytes` limits each source file before rendering and defaults to 1 MiB. `includeOwnerInstructions` and `includeWorkspaceInstructions` both default to `true`, allowing the shipped Web composition to keep one Host-level owner reader while preset-level instances own only project guidance. `projectRootMarkers` defaults to `['.git']`; the project candidate and overlay defaults remain `['AGENTS.md', 'CLAUDE.md']` and `['AGENTS.local.md', 'CLAUDE.local.md']`.

The owner file is always `$DSH_HOME/AGENTS.md` with no local overlay; both candidate lists control only project scopes. `$DSH_HOME` defaults to `~/.dsh`. A non-positive or non-finite render budget disables both owner and workspace rendering; configured `maxSourceBytes` must be a positive integer.

## Budgeting And Bounded Reads

Rendering preserves the most specific instruction files first. It drops whole broader files before truncating the most-specific file and emits a visible `Workspace instruction budget ...` notice naming omitted and truncated paths. The rendered bytes never exceed `maxBytes`.

Instruction content is read through `streamText()` under `maxSourceBytes`, even when provider metadata omits size or a file grows after its metadata probe. An oversized file is ignored; during dynamic reconciliation it is temporarily unavailable rather than removed. The plugin keeps no process-wide cache and never caches instruction prose. Its session-local scope cache uses provider versions only as a fast invalidation signal; after invalidation, SHA-1 over the bounded read remains the cross-provider content identity stored in the structured message source.

## Model Experience

### Baseline context

#### What the model sees

Every model step receives the current bounded owner file as the last protected system section. The first request also receives one durable user-role message containing only the project instruction chain in broad-to-specific order; resume reuses that project message when its visible baseline is compatible.

##### Baseline instruction template

```markdown
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: AGENTS.md

<project-instructions>
</system-reminder>
```

#### Token effect

The rendered baseline is appended once and remains in derived history until compaction. `maxBytes` bounds the complete message, broader files are omitted before the most-specific file is truncated, and an empty chain contributes zero tokens.

#### KV Cache effect

Append-only after the existing reusable prefix. Resume preserves reuse when the visible baseline identity is compatible; an incompatible identity appends a complete replacement, so discovery, precedence, project-root, or budget changes affect reuse only from that history position.

### Newly discovered scope context

#### What the model sees

After a successful first-party filesystem call reaches a deeper directory, the next request includes one retained sourced `user/message` with the newly applicable instruction file.

##### Additional instruction template

```markdown
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

These instructions apply to work under `packages/app`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

<nested-instructions>
</system-reminder>
```

#### Token effect

Each discovered scope adds bounded history tokens until compaction. Unchanged content is suppressed by visible session state plus version/digest comparison, and Code Mode defers the same message until after the outer `run_code` result and its enclosing durable step.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Changed or removed instruction context

#### What the model sees

A changed file produces `Updated instructions from: <path>` plus its replacement content. A candidate that disappears or becomes a per-directory duplicate of an earlier candidate produces the removal notice below.

##### Removal notice

```markdown
<system-reminder>
Instructions removed: packages/app/AGENTS.md

The previously loaded instructions from this file no longer apply.
</system-reminder>
```

#### Token effect

Each confirmed change or removal is one retained history message bounded by `maxBytes`. Provider failures add no message, and an update omitted by the budget remains eligible for a later filesystem touch.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Discovery follows structured fs tools, not shell navigation** — a `bash` command that changes directories does not trigger nested instruction discovery because shell syntax and per-call shell state are not a reliable filesystem seam.
- **Project refresh is touch-driven** — project-file edits become visible on the next successful first-party `read`, `write`, or `edit`, on resume reconciliation, or when a pre-step restores a shadowed baseline. The owner `$DSH_HOME/AGENTS.md` is different: it is re-read on every prompt assembly and therefore applies on the next model step.
- **Candidate semantics stay intentionally small** — lowercase names, `.claude/rules/`, and `@path` imports are not interpreted; project scopes load `AGENTS.local.md`/`CLAUDE.local.md` overlays by default, but the user-global `$DSH_HOME` scope has no local overlay and other custom names require explicit candidate configuration.
- **Per-directory dedup is content-based** — sibling candidates collapse only when byte-identical after trimming leading and trailing whitespace; a `CLAUDE.md` that symlinks its sibling `AGENTS.md` resolves to the same content and collapses like any duplicate, while a distinct real copy that has drifted from `AGENTS.md` loads in full alongside it.
- **Symlinked instruction files are followed across the trust boundary** — a candidate whose final component is a symlink is resolved and its target loaded, so a cloned repository can surface off-tree file content as lower-authority workspace guidance (it never overrides system, developer, or direct user instructions). Confine `ctx.fs` with the filesystem policy gate or an OS sandbox when loading untrusted repositories.
- **Instruction content is bounded, not summarized** — over-budget broad files are omitted and the most-specific file may be truncated; the plugin never asks a model to compress instruction prose.

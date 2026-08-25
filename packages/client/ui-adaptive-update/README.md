# Adaptive Update UI

English | [中文](README.zh.md)

Native Host and Client plugin for safely adapting Xiaozhuang DSH to destructive upstream preview changes.

The Settings entry and page are both titled **自适应更新**. Starting an update does not change the live checkout immediately. A detached worker first pins the official commit, performs a disposable trial merge, asks the still-running stable DSH Agent for a semantic compatibility review, discards that review tree, and applies the plan in a separate candidate worktree.

The candidate must pass dependency installation, plugin regression tests, Host and Client type checking, the production build, Web replay, and a shadow boot with a minimal private DSH Home. Only then does the worker wait for every live conversation to become idle, stop the old runtime, create one copy-on-write data snapshot, move the source checkout to the verified candidate, and require both Host and Client readiness. A failed launch restores the previous Git commit and the data snapshot before reopening DSH.

Conversation logs, attachments, credentials, and user settings remain in the original DSH Home throughout review and validation. Review trees, candidate trees, shadow homes, and old logs are deleted after completion. Git objects hold source history, and retention keeps at most one previous copy-on-write data snapshot instead of one full product copy per version.

The HTTP surface is loopback-only under `/plugins/ui-adaptive-update/api`. The operation state is atomically persisted outside DSH Home so a new plugin instance can recover an interrupted cutover without depending on the process being replaced.

## Development

```sh
pnpm exec vitest run packages/client/ui-adaptive-update/tests
pnpm exec tsc -b packages/client/ui-adaptive-update/tsconfig.host.json
pnpm --filter @deepseek-ai/dsh-client-ui-adaptive-update run bundle
```

## Model Experience

### Compatibility review request

#### What the model sees

A stable Headless DSH Agent receives the pinned merge inventory, including `conflictFiles`, `overlappingFiles`, `impactedPlugins`, and `riskAreas`, plus instructions to produce a Chinese compatibility report without modifying the disposable review tree.

#### Token effect

One independent model request is made only after the user starts an update; its input and output size depend on the deterministic inventory and repository review.

#### KV Cache effect

The review runs in a shadow DSH Home and an independent Headless session. It does not append to or replace the active user's conversation context, so it does not invalidate that conversation's reusable prefix.

### Candidate adaptation request

#### What the model sees

A second stable Headless DSH Agent receives the completed compatibility report, deterministic conflict inventory, and instructions to resolve the candidate without committing, touching the real DSH Home, or stopping the live product.

#### Token effect

One independent model request is made for a reviewed candidate; its input includes the review report and its output depends on the required adaptation.

#### KV Cache effect

The adaptation runs in the same isolated shadow Home but a separate Headless invocation. It is independent from active conversation KV-cache reuse; changes to the report or pinned commits affect only this update request.

## Known Limitations and Deferred Work

- **Source checkout required** — The updater requires a clean Git checkout, a reachable official Git remote, Node.js, pnpm, and enough temporary space for one candidate worktree; packaged installations without repository metadata cannot use this path.
- **Copy-on-write data snapshot** — The zero-growth rollback design requires a filesystem that supports clone or reflink copies. Unsupported filesystems fail before source cutover instead of copying the complete DSH Home.

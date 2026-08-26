# Continuous Adaptation UI

English | [中文](README.zh.md)

Native Host and Client plugin for keeping Xiaozhuang DSH compatible with destructive upstream preview changes.

The Settings entry and page are both titled **持续适配**. The existing manual button still starts an update on demand. An **自动更新 · 每 6 小时** capsule persists the user's choice, starts monitoring immediately when enabled, and checks the official branch every six hours. A new official commit starts the same detached update operation; an already integrated commit does nothing.

The fast path pins the official commit and performs a real trial merge to find actual Git conflicts. It does not run a semantic review. A second candidate worktree repeats the pinned merge; no model request is made when Git resolves it cleanly. When conflicts exist, one bounded stable DSH Agent invocation receives only those files and their directly affected plugins. The candidate then prepares frozen dependencies and runs one production build. Plugin regression suites, a separate full-repository typecheck, Web replay, and a pre-cutover shadow boot are deliberately excluded from the product update path.

After the build, the worker waits for every live conversation to become idle, stops the old runtime, creates one copy-on-write data snapshot, moves the source checkout to the candidate, and requires the restarted Host and Client to become ready. A failed launch restores the previous Git commit and data snapshot before reopening DSH. One build failure may receive one narrowly scoped repair attempt; every other failure leaves the live product unchanged.

Conversation logs, attachments, credentials, and user settings remain in the original DSH Home throughout conflict handling and building. Review trees, candidate trees, private Agent homes, and old logs are deleted after completion. Git objects hold source history, and retention keeps at most one previous copy-on-write data snapshot instead of one full product copy per version.

The loopback-only HTTP surface under `/plugins/ui-adaptive-update/api` owns manual start, automatic preference, state, and idle probes. Both operation state and the automatic preference are atomically persisted outside DSH Home, so monitoring survives restarts and a new plugin instance can recover an interrupted cutover without depending on the process being replaced.

## Model Experience

### Conflict adaptation request

#### What the model sees

A stable Headless DSH Agent receives only the deterministic `conflictFiles` inventory and directly affected plugins, with instructions to resolve that narrow candidate without committing, touching the real DSH Home, running broad verification, or stopping the live product.

#### Token effect

No model request is made for a clean Git merge. A conflicting merge uses one bounded request; one additional bounded request is possible only when the production build fails after conflict resolution.

#### KV Cache effect

Adaptation runs in a private DSH Home and an independent Headless session. It does not append to or replace the active user's conversation context, so it does not invalidate that conversation's reusable prefix.

## Known Limitations and Deferred Work

- **Running Web profile** — The six-hour timer runs while DSH Web is alive. An enabled preference performs an immediate catch-up check on the next startup, so a release published while the product was closed is discovered then.
- **Source checkout required** — The updater requires a clean Git checkout, a reachable official Git remote, Node.js, pnpm, and enough temporary space for one candidate worktree; packaged installations without repository metadata cannot use this path.
- **Copy-on-write data snapshot** — The zero-growth rollback design requires a filesystem that supports clone or reflink copies. Unsupported filesystems fail before source cutover instead of copying the complete DSH Home.

# Agent Note: Native continuous adaptation

Status: implemented

English | [中文](2026-08-26-native-adaptive-update.zh.md)

## Problem

DSH is an early preview whose upstream changes can invalidate package structure, Client contracts, profile composition, persistence assumptions, and local plugins at once. Applying those changes directly to the running checkout can leave the product unavailable while conflicts are still being understood or repaired.

## Decision

The Web profile ships one native Host and Client plugin named `@deepseek-ai/dsh-client-ui-adaptive-update`. Its Settings entry and page are both titled **持续适配**. The manual action pins one official commit and delegates long-running work to a detached process that survives the live DSH process.

An **自动更新 · 每 6 小时** capsule persists an opt-in preference outside DSH Home. Enabling it arms the monitor and checks the official branch immediately; later checks run every six hours. A remote commit already contained by local `HEAD` is a no-op. A new commit starts the same detached operation as the manual action, so scheduling does not create a second update implementation.

The detached process performs a real trial merge in a disposable worktree and computes the exact Git conflicts. It does not request a semantic review. The process deletes that tree, repeats the pinned merge in a separate candidate, and skips the model entirely when Git resolves the merge. When conflicts exist, one bounded stable Headless Agent invocation receives only the conflict files and directly affected plugins and resolves the candidate without committing or touching the real DSH Home.

The candidate must have no unresolved merge entries, prepare frozen dependencies, and pass one production build. One failed build may return to one narrowly scoped Agent repair before the build repeats. Updater regression suites, a separate repository-wide typecheck, Web replay, and a pre-cutover shadow boot are outside the product update path. The live checkout and user data do not change during conflict handling or building.

## Cutover transaction

After validation, the detached process commits the candidate, waits until every root Agent is idle, stops the live runtime, creates one copy-on-write DSH Home snapshot, and advances the clean checkout to the candidate commit. The candidate must make both the Host page and its Client asset reachable. Failure restores the previous Git commit and data snapshot before restarting the old runtime.

The operation state is atomically persisted in a plugin-owned sibling directory outside DSH Home. An interrupted applying phase is recoverable by a later plugin instance: a ready candidate completes, while any other state restores the previous commit and snapshot.

## Retention and privacy

Conflict handling copies only the configuration files required by the stable Agent into a private Home. Sessions, attachments, workspaces, and other user data remain in the real Home. Git objects retain source history; successful cleanup removes review, candidate, private-Agent, and log artifacts and keeps at most one previous copy-on-write data snapshot.

## Alternatives considered

**Merge upstream in the live checkout.** This provides no usable product while conflicts, dependency changes, and startup failures are being repaired, so one failed edit can take down the complete DSH process.

**Enable background updates without a user switch.** Mandatory monitoring removes user control over network checks and source changes. Continuous adaptation is opt-in, persists the explicit choice, and still waits for conversations to become idle before cutover.

**Deep semantic review plus exhaustive replay before every update.** This maximizes local evidence but made an ordinary upstream merge take hours. The shipped path scopes Agent work to real conflicts and uses one production build as the compatibility boundary; readiness and rollback remain at cutover.

**Keep one complete product directory per version.** Full copies make retained storage grow by hundreds of megabytes per release. Git history plus disposable worktrees and one copy-on-write data snapshot provide rollback without permanent version directories.

**Patch Loader state inside the running process.** Package, Host, Client, and persistence changes do not share one reversible in-process boundary. The detached candidate and restart transaction keep uncertain work outside the process being protected.

## Consequences

Users can update on demand or opt into six-hour monitoring while continuing to use the old version during conflict handling and building. Active conversations delay the brief switch, and conversation and attachment storage remains authoritative across the update. Clean merges use no model request; conflicts use one bounded request, with at most one additional build-repair request. This speed gives up exhaustive behavioral replay before cutover, while the production build, startup readiness check, source rollback, data rollback, bounded temporary checkout, and one retained copy-on-write snapshot preserve the common recovery path.

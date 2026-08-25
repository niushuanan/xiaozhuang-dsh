# Agent Note: Native adaptive update

Status: implemented

English | [中文](2026-08-26-native-adaptive-update.zh.md)

## Problem

DSH is an early preview whose upstream changes can invalidate package structure, Client contracts, profile composition, persistence assumptions, and local plugins at once. Applying those changes directly to the running checkout can leave the product unavailable while conflicts are still being understood or repaired.

## Decision

The Web profile ships one native Host and Client plugin named `@deepseek-ai/dsh-client-ui-adaptive-update`. Its Settings entry and page are both titled **自适应更新**. A user-started operation pins one official commit and delegates all long-running work to a detached process that survives the live DSH process.

The detached process performs a real trial merge in a disposable review worktree. The stable DSH Headless Agent reviews that exact tree without changing it. The process then deletes the review tree, repeats the pinned merge in a separate candidate worktree, and asks the stable Agent to resolve and adapt the candidate without committing or touching the real DSH Home.

The candidate must have no unresolved merge entries and must pass frozen dependency installation, updater regression tests, Host and Client type checking, the production build, Web replay, and a shadow Host-and-Client boot. The live checkout and user data do not change during these phases.

## Cutover transaction

After validation, the detached process commits the candidate, waits until every root Agent is idle, stops the live runtime, creates one copy-on-write DSH Home snapshot, and advances the clean checkout to the candidate commit. The candidate must make both the Host page and its Client asset reachable. Failure restores the previous Git commit and data snapshot before restarting the old runtime.

The operation state is atomically persisted in a plugin-owned sibling directory outside DSH Home. An interrupted applying phase is recoverable by a later plugin instance: a ready candidate completes, while any other state restores the previous commit and snapshot.

## Retention and privacy

Review and validation copy only the configuration files required by the stable Agent into a private shadow Home. Sessions, attachments, workspaces, and other user data remain in the real Home. Git objects retain source history; successful cleanup removes review, candidate, shadow, and log artifacts and keeps at most one previous copy-on-write data snapshot.

## Alternatives considered

**Merge upstream in the live checkout.** This provides no usable product while conflicts, dependency changes, and startup failures are being repaired, so one failed edit can take down the complete DSH process.

**Automatically update whenever upstream moves.** Background code replacement can interrupt active work and makes a semantic compatibility decision without user intent. The shipped operation is explicit and spends as long as needed on review before any cutover.

**Keep one complete product directory per version.** Full copies make retained storage grow by hundreds of megabytes per release. Git history plus disposable worktrees and one copy-on-write data snapshot provide rollback without permanent version directories.

**Patch Loader state inside the running process.** Package, Host, Client, and persistence changes do not share one reversible in-process boundary. The detached candidate and restart transaction keep uncertain work outside the process being protected.

## Consequences

Users can continue using the old version during review, adaptation, and validation, and active conversations delay the brief switch. Conversation and attachment storage remains authoritative across the update. The design costs one temporary candidate checkout, two independent model requests, and one retained copy-on-write snapshot; it also requires a clean Git checkout and a filesystem that supports clone or reflink copies.

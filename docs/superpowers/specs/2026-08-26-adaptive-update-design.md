# Native Adaptive Update Design

English | [中文](2026-08-26-adaptive-update-design.zh.md)

**Date:** 2026-08-26

**Status:** Confirmed for implementation

## Product contract

The Settings entry and page title are both “自适应更新” in Chinese. The page has no introductory tagline. One primary action starts the complete operation: the current stable DSH first performs a long read-only review, then adapts an isolated candidate, validates it, and applies it only after every required check passes.

The native plugin is developed on the latest local Xiaozhuang DSH commit before any official update is merged. Its first real operation adapts that local product to the latest `deepseek-ai/deepseek-harness` master commit. This ordering is an acceptance requirement: a manually pre-merged upstream cannot substitute for the plugin's own update run.

## Stable runner and two isolated trees

The running local version remains the stable update runner. It creates a disposable review worktree at the exact local commit, performs a trial upstream merge there, inventories changed packages, plugins, persistence surfaces, configuration, and text conflicts, and asks the stable headless DSH Agent for a read-only semantic review. The review tree is discarded regardless of outcome.

Only after the review completes does the runner create a separate candidate worktree, repeat the pinned merge, and ask the stable headless DSH Agent to resolve conflicts and preserve local product behavior. A broken candidate never becomes the executable that is doing the repair.

The review and adaptation Agents run with a private shadow `DSH_HOME`. Only the minimum model configuration, credentials, owner instructions, and settings needed to run the stable Agent are copied into it. Candidate sessions, profiles, and generated files never enter the user's real DSH data directory.

## Review report

The persisted report pins the local commit, upstream commit, merge base, changed-file counts, direct conflict files, impacted package and plugin names, and high-risk areas including profile composition, settings, session persistence, attachments, and migrations. It also stores the stable Agent's semantic review. The UI shows the operation phase and report; it does not expose Git commands or implementation-only state as product concepts.

## Candidate verification

The candidate must have no unresolved merge entries and must pass dependency installation, repository diff checks, focused update-plugin tests, host/client type checks, production build, replayed Web tests, and a real shadow Web boot. Host readiness requires the HTTP server; Client readiness additionally requires the generated page and browser assets to load. Failure leaves the running product and its data untouched.

## Cutover and rollback

The external update worker survives the current DSH process. At cutover it waits for the running product to become idle, stops it, creates one copy-on-write snapshot of the real DSH data, advances only a clean source checkout to the verified candidate commit, and restarts the same launch contract. If an external supervisor such as launchd restarts DSH itself, the worker observes that process rather than starting a duplicate.

The new version must pass Host and Client readiness on the real port. Otherwise the worker stops it, restores the previous Git commit and data snapshot, and restarts the previous version. Source updates never edit the real `DSH_HOME`; the only real-data mutation is the bounded snapshot and an atomic whole-directory restore during rollback.

## Storage policy

Git objects are the version store; the plugin does not copy a complete DSH installation per release. It retains the current and previous commit identifiers, one previous-data copy-on-write snapshot, the latest compact report, and no completed candidate worktree. Review trees, failed candidates, shadow homes, transient logs, and older snapshots are removed by the operation that created them. Cleanup only traverses the plugin-owned control directory and registered Git worktrees.

## Native product surface

`ui-adaptive-update` is one Host-and-Client Cordis plugin. The Host owns the loopback API, durable operation state, worker launch, repository inspection, and update lifecycle. The Client contributes one Settings section through the existing slot system and polls the persisted job state. The navigation uses a hand-drawn 16 px `currentColor` SVG: an open protective ring around a stable center, matching the existing icon stroke and optical weight.

## Prior art

The design reimplements, rather than hot-loading, the useful ideas from the MIT-licensed DSH ecosystem: immutable current/previous state and atomic pointer recovery from `amplifthq/oh-my-dsh`, temporary `DSH_HOME` startup checks and restoration from `Xrainsmile/DSH-Plugin-Doctor`, scripted child-process compatibility checks from `BotonJ/dsh-windtunnel`, and report-first risk presentation from `hezhongtang/dsh-update-copilot`. It deliberately rejects in-process Loader surgery and timeout paths that continue into mutation.

## Acceptance criteria

1. Local Xiaozhuang DSH contains the native plugin before upstream is merged.
2. Starting “自适应更新” keeps the current Web product usable during review, adaptation, build, and shadow boot.
3. The report names the pinned commits, conflicts, affected plugins, and semantic handling before candidate adaptation starts.
4. The plugin itself adapts the local product to the latest official master and produces a verified candidate.
5. A failed candidate never replaces the current source or writes the real DSH data directory.
6. Cutover preserves sessions, conversations, attachments, settings, credentials, and memory; failed real startup restores both code and data.
7. Completed runs leave no review/candidate worktree and retain at most one previous-data snapshot.

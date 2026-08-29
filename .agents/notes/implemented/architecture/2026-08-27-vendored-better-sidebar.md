# Agent Note: The workbench sidebar is vendored as a first-party service-ized surface, and the Computer Use browser bridge is retired

Status: implemented

English | [中文](2026-08-27-vendored-better-sidebar.zh.md)

## Problem

The product had no session-scoped workbench: files, diffs, terminals, browsing, background jobs and subagent activity lived either in model transcripts or in one-off panels, and every self-developed plugin invented its own UI extension seam. Browsing ran through the Computer Use Chrome bridge (extension pairing, per-session Playwright contexts), a heavier surface than most viewing tasks need.

## Decision

Vendor omdsh-dev/DSH-better-sidebar v0.17.0 (MIT) into `packages/workbench/better-sidebar` as a first-party package and adapt it to the fork instead of npm-installing it:

- **Service-ized extensibility.** Built-in tabs and file viewers register through the same `ctx.betterSidebar` service (`registerTab` / `registerFileViewer`) that any future plugin uses, with the monotonic `features` capability list, tab lifecycle callbacks, and targeted `openTab(seed, scope)`. The cordis augmentation is reachable via `import type {} from '@deepseek-ai/dsh-better-sidebar/client'` (the root export deliberately does not merge it — the host face cannot see React-typed client modules).
- **Session-isolated layout state.** Per-session `dsh-sidebar:v1:<id>` localStorage persistence with full sanitization, a shared width key, and the `?dsh-sidebar-reset` escape hatch. Right panel + bottom panel split trees, free-floating windows, and the sub-768px merged drawer all ride one reducer-backed store.
- **Terminal backend rewritten onto the fork's subprocess seam.** The upstream node-pty direct usage is replaced by `ctx.subprocess.spawnTerminal` (transcript ring, park/reconnect-grace, per-session quota preserved), and `SubprocessTerminalHandle` gains an optional `resize?()` implemented by the local node-pty driver. UI terminals are user actions and run with user permissions; the model's terminals stay on the sandbox-policy-governed `ctx.terminals` seam (`tool-terminal`), and are mirrored into read-only sidebar tabs (`agent-terminal` with per-session ownership checks on `agent-terminal.read`/`agent-terminal.close`). The upstream `terminal_*` tool set stays unregistered (`agentTerminalTools: false`) to avoid tool duplication.
- **Browser replacement.** The Computer Use host/client mount rows are absent from the web-app bundle (sources remain available for restoration); the vendored sandboxed iframe browser, its protocol-split link interception, the embed-refusal probe, and the `browserAllowedLoopback` allowlist form the browsing surface. Its address field has explicit URL and direct-search modes, with a per-user default for new tabs; direct search uses Bing because its result page renders in the same sandbox, while URL mode retains scheme and loopback checks. A site that forbids framing receives an explanatory fallback to the system browser rather than an ineffective forced iframe load. This partially supersedes the [native Computer Use note](../../implemented/feature/2026-08-21-native-computer-use-and-browser-bridge.md): the bridge/isolated-browser decision there is retired, while its desktop-control rationale and restoration path stay live. `sidebar_open` defaults to enabled so the model can open files/folders/pages in the calling session's sidebar (queued per session, replayed on attach).
- **Fork-convention compliance.** Real Loader-composition boot test over the actual webServer/web-app/session/tools/subprocess tree (fence 200/403 asserted); test files name their compile face (`*.client.spec.*`); staged lint, package invariants, and both tsconfig aggregates are green. The package mounts from the web-app bundle with a single Loader row; the live profile patch layer adds the same row so `watchUserPatches` hot-mounts it without a restart.

## Consequences

- The workbench (explorer / editor / terminal / git / browser / jobs / sidechat) is live on the running instance through the profile-patch hot-reload path; removing the profile row reverts it transactionally.
- `dsh-better-sidebar` is now a fork-owned package: upstream updates must be re-ported through the documented adaptation seams (locale dict form, fork service faces, chunk CSS pipeline).
- `/computer` desktop control and `/browser` (isolated Playwright + connected bridge) are absent from the Web composition; the browser-bridge extension is unnecessary. Restoring them requires re-adding the two bundle rows.
- The side-card browser remains an iframe rather than a Chrome engine. It can use embeddable pages and search results, but remote `X-Frame-Options` or CSP `frame-ancestors` policy wins even when the local sandbox is disabled; those pages open in the system browser.
- Known limitations carried over: 19 third-language dictionaries and better-locale integration dropped; the settings-nav icon dropped (no fork contract); the ecosystem plugin directory ships empty; host/client type propagation for `ctx.betterSidebar` requires the `/client` export.

## Alternatives considered

- **npm-install + adapter plugin.** Rejected: the fork's client service faces differ enough that the stock bundle would misbehave (layout-push selectors, locale registration, sessions API), and internal rewrites (subprocess terminal backend) need the source in-tree.
- **Re-implementing the workbench natively.** Rejected: the upstream implementation is test-hardened (hundreds of unit tests ported), and vendoring keeps the diff reviewable against its origin.
- **Keeping the Computer Use bridge.** Rejected by the owner: the sandboxed iframe browser covers the viewing surface with far less machinery; the bridge remains available in source for rollback.
- **Google iframe search.** Rejected after real Chromium validation returned Google's access-error page instead of results. Bing rendered its result list in the same sandbox without adding another browser process or proxy service.

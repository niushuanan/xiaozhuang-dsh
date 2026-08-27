# @deepseek-ai/dsh-better-sidebar

Vendored and adapted from [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (MIT) for the xiaozhuang-dsh workspace. A service-ized workbench for the DSH web surface: a session-isolated right sidebar plus a bottom panel (file explorer, CodeMirror editor, real terminal, Git panel, sandboxed browser, background-jobs/subagent view, and Codex-style side conversations), with every built-in tab and file viewer registered through the same `ctx.betterSidebar` service that external plugins use (`registerTab` / `registerFileViewer`).

## Layout

- Host half (`src/index.ts` and friends): the `/sidebar/api` JSON routes, `/sidebar/file` media route, `/sidebar/html` sandboxed preview route, `/sidebar/upload`, `/sidebar/bundle` lazy-chunk route, and the terminal / agent-terminals / agent-opens WebSocket upgrades — all behind the same browser trust fence as the `/api` gateway. File operations are realpath-bounded to the session workspace; UI terminals run through `ctx.subprocess.spawnTerminal` with the plugin's own transcript / park / reconnect-grace lifecycle.
- Client half (`src/client/`): the workbench UI, the per-session layout store (localStorage `dsh-sidebar:v1:<id>`, sanitized on load), the `ctx.betterSidebar` service, and the declarative side-card settings section. Heavy dependencies (xterm, CodeMirror, Mermaid) load as lazy chunks from `/sidebar/bundle`.
- Extensions: `ctx.betterSidebar.registerTab` / `registerFileViewer` — the 7 built-in tabs and 6 viewers use the same registry as third-party plugins (capability parity). See `src/client/service.ts` for the full contract.

## Model Experience

When the `agentOpenTools` side-card setting is on, one `sidebar_open` tool lets the model open files / folders / HTTP(S) pages in the calling session's sidebar (queued per session, replayed on the next view attach). The upstream `terminal_*` tools stay unregistered by default: model-facing terminals go through the repository's own `tool-terminal` + `ctx.terminals` seam.

## Known Limitations and Deferred Work

- UI terminals are user actions and run with the user's permissions; they do not pass through the sandbox policy that governs model tool execution.
- The layout push targets the fork's `[data-dsh-frame]` / `[data-pane="conversation"]` markers (added to `AppFrame` in the same change); under multi-window split panes the push follows the active pane.
- The upstream 19 third-language dictionaries, the dshfind registry channel, and the 28+ ecosystem plugin directory are not carried; the service API is kept so they can be re-added.
- Git panel has no push/pull/fetch; file viewers have no watcher (manual refresh); the bottom panel merges into the right drawer below 768px.

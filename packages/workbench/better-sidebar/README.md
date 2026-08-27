# @deepseek-ai/dsh-better-sidebar

Vendored and adapted from [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (MIT) for the xiaozhuang-dsh workspace. A service-ized workbench for the DSH web surface: a session-isolated right sidebar plus a bottom panel (file explorer, CodeMirror editor, real terminal, Git panel, sandboxed browser, background-jobs/subagent view, Codex-style side conversations, and a read-only model-terminal mirror), with every built-in tab and file viewer registered through the same `ctx.betterSidebar` service that external plugins use (`registerTab` / `registerFileViewer`).

## Layout

- Host half (`src/index.ts` and friends): the `/sidebar/api` JSON routes, `/sidebar/file` media route, `/sidebar/html` sandboxed preview route, `/sidebar/upload`, `/sidebar/bundle` lazy-chunk route, and the terminal / agent-terminals / agent-terminal-mirror / agent-opens WebSocket upgrades — all behind the same browser trust fence as the `/api` gateway. File operations are realpath-bounded to the session workspace; UI terminals run through `ctx.subprocess.spawnTerminal` with the plugin's own transcript / park / reconnect-grace lifecycle.
- Client half (`src/client/`): the workbench UI, the per-session layout store (localStorage `dsh-sidebar:v1:<id>`, sanitized on load), the `ctx.betterSidebar` service, and the declarative side-card settings section. Heavy dependencies (xterm, CodeMirror, Mermaid) load as lazy chunks from `/sidebar/bundle`.
- Extensions: `ctx.betterSidebar.registerTab` / `registerFileViewer` — the 8 built-in tabs and 6 viewers use the same registry as third-party plugins (capability parity). See `src/client/service.ts` for the full contract.

## Model Experience

- `agentOpenTools` (ON by default): one `sidebar_open` tool lets the model open files / folders / HTTP(S) pages in the calling session's sidebar (queued per session, replayed on the next view attach). Turn it off in the side card settings to keep the model from driving the panel.
- Model-terminal mirror: the model's official `terminal_*` tools (the repository's `tool-terminal` + `ctx.terminals` seam) are reflected into read-only `agent-terminal` tabs. `src/agent-terminal-bridge.ts` snapshots each live agent's terminals and pushes the list over `/sidebar/ws/agent-terminal-mirror`; each tab polls `agent-terminal.read` (tail page) at 1s and shows a `running` / `exited (code N)` status line. The view is output-only — the model owns the interactive send seam exclusively, so the mirror never races a `terminal_send`.
- The fork's own `agentTerminalTools` feature (8 `terminal_create`-style tools backed by `src/agent-pty.ts`) stays OFF by default and is independent of the mirror above.

## Defaults

`SIDEBAR_PREFS_DEFAULTS` / `PrefsSchema` (src/prefs-shared.ts, src/config.ts): `agentOpenTools: true`, `browserInterceptLinks: true`, `browserInterceptHttp: true`, `browserInterceptHttps: false`, `agentTerminalTools: false`, `editorExplorer: false` (the independent / split editor mode — the path-less window is the explorer).

## Testing

`tests/loader-composition.spec.ts` is the real-composition boot test: it boots a real `cordis.yml` through the Loader with the REAL `dsh-host-webserver` / `dsh-web-app` / `dsh-session` / `dsh-tools` / `dsh-subprocess-local` implementations (the web-app dist is stubbed through `internals.resolveDistIndex`), then asserts the plugin's entry reaches the active phase, `session.cwd` returns a 200 envelope over a listening port, a foreign Host is fenced 403, and teardown leaves no residue.

## Known Limitations and Deferred Work

- UI terminals are user actions and run with the user's permissions; they do not pass through the sandbox policy that governs model tool execution.
- The layout push targets the fork's `[data-dsh-frame]` / `[data-pane="conversation"]` markers (added to `AppFrame` in the same change); under multi-window split panes the push follows the active pane.
- The upstream 19 third-language dictionaries, the dshfind registry channel, and the 28+ ecosystem plugin directory are not carried; the service API is kept so they can be re-added.
- Git panel has no push/pull/fetch; file viewers have no watcher (manual refresh); the bottom panel merges into the right drawer below 768px.
- `ctx.betterSidebar` type merge is reachable only through the client subpath: `import type {} from '@deepseek-ai/dsh-better-sidebar/client'` triggers the `declare module '@deepseek-ai/cordis'` augmentation, while the root `@deepseek-ai/dsh-better-sidebar` export (the shared `Context` intersection) does not.

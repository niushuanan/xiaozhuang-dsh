---
description: "Use the session-scoped DSH side workbench for files, terminals, Git, lightweight browsing, tasks, and plugin-provided tabs."
kind: "package-reference"
---

# @deepseek-ai/dsh-better-sidebar

English | [中文](README.zh.md)

## Summary

`dsh-better-sidebar` gives each DSH session a persistent right sidebar and bottom panel for files, editing, terminals, Git, lightweight web browsing, background tasks, side conversations, and model-terminal output. The browser accepts explicit URL or direct-search input while keeping remote pages inside a sandboxed iframe by default. External plugins use the same `ctx.betterSidebar.registerTab` and `registerFileViewer` operations as the built-in tabs and viewers. The Web application mounts this first-party package directly; do not install a second `dsh-better-sidebar` package into the same profile.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The shipped Web bundle mounts the package as `@deepseek-ai/dsh-better-sidebar`; users configure its behavior through **Settings → Side card**.

### Browse by URL or search

The browser address field has two explicit modes. **URL** normalizes HTTP(S) addresses and applies the loopback allowlist. **Search** keeps the entered query visible and opens Bing results in the same lightweight sandbox. The selector at the right edge changes the current tab's mode; **Default input mode** in Side card settings controls newly created browser tabs.

Pages that permit iframe embedding remain usable inside the side card. A target that sends `X-Frame-Options` or a blocking CSP `frame-ancestors` policy cannot be forced into any iframe; the side card explains that refusal and offers **Open in system browser**. Disabling the page sandbox does not bypass the remote site's embedding policy.

### Minimal configuration

The Web composition loads the package with one plugin row:

```yaml
- name: '@deepseek-ai/dsh-better-sidebar'
```

Host limits are optional and default in [`src/config.ts`](src/config.ts). Browser input mode and interception preferences are user settings, not Loader configuration:

| Preference | Default | Meaning |
|---|---|---|
| `browserDefaultMode` | `url` | Start a new browser tab in URL or direct-search mode |
| `browserNoSandbox` | `false` | Remove iframe sandbox isolation for fully trusted pages |
| `browserInterceptLinks` | `true` | Allow eligible GUI links to route into the side card |
| `browserInterceptHttp` | `true` | Route HTTP links when interception is enabled |
| `browserInterceptHttps` | `false` | Route HTTPS links when interception is enabled |
| `browserAllowedLoopback` | empty | Comma-separated local addresses that the side browser may visit |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The host half owns `/sidebar/api`, media, HTML, upload, lazy-bundle, terminal, task, and model-terminal routes behind the browser trust fence. File operations remain realpath-bounded to the calling session workspace, and UI terminals run through `ctx.subprocess.spawnTerminal` with transcript, parking, and reconnect ownership.

The client half owns the workbench UI, sanitized per-session layout persistence under `dsh-sidebar:v1:<id>`, the browser resolver and embed probe, and the declarative Side card settings page. Heavy editor, terminal, and Mermaid dependencies load as separate chunks. Built-in tabs and external client plugins register through the same `ctx.betterSidebar` service.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Workbench sidebar decision](../../../.agents/notes/implemented/architecture/2026-08-27-vendored-better-sidebar.md) — package ownership, browser choice, and rejected alternatives.
- [Web application composition](../../bundle/web-app/cordis.patch.yml) — the shipped mount row.
- [`BrowserView`](src/client/BrowserView.tsx) and [browser resolver](src/client/browser.ts) — address-bar behavior, search resolution, and embedding fallback.

-----

<a id="model-experience"></a>
## Model Experience

### Side-card opening

#### What the model sees

When `agentOpenTools` is enabled, the model receives the `sidebar_open` tool with a target and optional title. Its result says whether the file, folder, or HTTP(S) page was delivered to a connected side card or queued for that session. Browser layout, navigation history, search results, and page contents never enter model context.

#### Token effect

The tool definition contributes tokens while enabled. Each call contributes its ordinary tool call and result; browser UI state and remote page contents add no tokens.

#### KV Cache effect

The registered tool set stays stable while `agentOpenTools` is unchanged. Toggling the setting changes the tool-definition prefix for later requests, while opening or navigating a tab does not change that prefix.

### Optional sidebar terminal tools

#### What the model sees

When `agentTerminalTools` is enabled, the model receives eight package-owned `terminal_*` tools and their bounded results. The read-only mirror of the model's official terminal sessions is UI-only and adds no model content.

#### Token effect

The optional tool definitions and their calls and results contribute tokens only while enabled and used. Terminal output that the model does not read through these tools adds no tokens.

#### KV Cache effect

Enabling or disabling `agentTerminalTools` changes the available tool-definition prefix for later requests. Terminal output changes only the tool-call and result history actually returned to the model.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The browser is a sandboxed iframe, not an embedded Chrome engine. Sites that forbid framing or require unavailable third-party cookies must open in the system browser.
- In-frame link navigation is owned by the remote page and does not create address-bar history entries.
- UI terminals run with the user's permissions rather than the model sandbox policy.
- Git has no push, pull, or fetch; file viewers require manual refresh; the bottom panel merges into the right drawer below 768 px.
- The upstream third-language dictionaries, better-locale integration, settings-nav icon, and ecosystem plugin directory are not included.
- `ctx.betterSidebar` type augmentation requires `import type {} from '@deepseek-ai/dsh-better-sidebar/client'`; the host root export does not merge React client types.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The package is vendored from `omdsh-dev/DSH-better-sidebar` v0.17.0 under MIT. Re-port upstream changes through the fork's locale dictionary, client service, subprocess terminal, and chunk-CSS adaptations.

</details>

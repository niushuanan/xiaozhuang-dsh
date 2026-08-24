# Xiaozhuang DSH

English | [中文](README.zh.md)

Xiaozhuang DSH is a community, plugin-enhanced distribution built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It keeps the upstream “everything is a plugin” foundation and adds product features that make local AI work easier to inspect, control, and extend.

> This is an independent community project, not an official DeepSeek release. Upstream architecture, license, and attribution remain intact.

[Download the latest release](https://github.com/niushuanan/xiaozhuang-dsh/releases/latest) · [View the upstream project](https://github.com/deepseek-ai/deepseek-harness)

## Why this distribution exists

DeepSeek Harness already provides a rich agent runtime, plugin composition, sessions, tools, model adapters, and a Web workspace. This repository does not replace that foundation. It develops additional capabilities as native plugins or narrow extension-point changes, so each feature can be understood, enabled, removed, and iterated independently.

The product priorities are straightforward: the core workflow must work, common failures must be recoverable, and the interface must remain compact enough for daily use.

## Included enhancements

| Area | What it adds |
| --- | --- |
| **Computer Use** | Native macOS desktop control, an isolated Playwright browser, connected Chrome control, and a resizable in-product browser workspace. |
| **Teamwork and parallel development** | Configurable Codex collaborators, isolated Git worktrees for independent tasks, separate review, and guarded integration back into the main workspace. |
| **Model usage** | A preloaded usage panel for DeepSeek, KIMI, GLM, and the signed-in GPT account, with explicit refresh, automatic refresh, quota windows, and reset times. |
| **Live session controls** | Agent preset changes during an existing conversation, model-aware reasoning defaults, and clearer placement for planning and team status. |
| **Plugin-ready composer** | A direct extension point for files, folders, commands, skills, and plugins without replacing the native composer workflow. |
| **Model input routing** | Explicit text and vision capability classification so native image models and tool-based vision fallbacks can coexist. |
| **Digital companion and AI voice input** | **Whale Girl** lives above the composer and follows Agent state, with blue/black skins, a custom name, microphone dictation, model-based text refinement, shortcuts, and local usage totals. |
| **Parallel windows** | Open any session in a complete DSH work window, up to four at once. Each window navigates, composes, and sends independently while the primary alone owns the companion. |
| **Conversation export and sharing** | Export the current conversation as a complete text record or one PNG long image that omits reasoning and tool internals. |
| **Project Agent rules** | Read, create, and edit the active project's root `AGENTS.md` directly from Whale Girl settings, with external-edit conflict protection. |

The implementation lives in ordinary DSH packages and profile patch layers instead of a parallel application. The main additions include [`packages/computer-use/`](packages/computer-use/), [`packages/client/ui-computer-use/`](packages/client/ui-computer-use/), [`packages/client/ui-provider-quota/`](packages/client/ui-provider-quota/), [`packages/client/ui-product-companion/`](packages/client/ui-product-companion/), [`packages/client/ui-multi-window/`](packages/client/ui-multi-window/), [`packages/session-query/session-log-export/`](packages/session-query/session-log-export/), and the subagent, conversation, preset, and plugin-loading extensions under [`packages/`](packages/).

### Computer Use workspace

<img src="design-qa-computer-use-wide-final.png" alt="Computer Use browser workspace inside Xiaozhuang DSH" width="920">

### Model usage panel

<img src="design-qa-provider-quota-v4.png" alt="DeepSeek, KIMI, GLM, and GPT usage panel" width="720">

### Parallel windows

Choose **Open in New Window** from any non-empty session's `…` menu to keep the primary task in place while opening that session in a complete auxiliary window. Current session, draft, and sending stay independent per window. The entry disables clearly at four total windows. Auxiliary windows do not duplicate the digital companion, and disabling the plugin never force-closes work already in progress.

### Digital companion: Whale Girl

**Whale Girl** is the default name, with “Whale” taken from DeepSeek's whale-inspired visual identity. The name is not locked: open the Settings entry bearing the character's current name and edit it in place. The navigation label, page heading, accessible name, context menu, and visibility switch update together and persist across reloads. The underlying plugin id remains stable, so renaming never affects hot-plugging or existing preferences.

She lives at the right edge directly above the real composer, with the visible silhouette touching its top border instead of covering draft text. Motion follows Agent state and the composer's measured position, not pointer hover. Switching conversations does not trigger travel by itself: the plugin waits for the transition layout to settle and opens the doorway only when the final anchor really differs by at least 6 px; a temporary bottom composer that returns to the same place is ignored. Idle, focus, waiting, and completion all use prone acting. When sending or layout reflow truly moves the composer, 12 redrawn close-camera portal frames keep the same character width as the lounge pose while the doorway progressively occludes her instead of shrinking her into a distant miniature. Lounge, focus, waiting, completion, and portal drawings follow a 24 fps exposure sheet synchronized with `requestAnimationFrame` and are predecoded into one image plane to avoid frame-swap flicker. The dedicated settings page controls blue/black skins, Standard/Large size, task bubbles, and independent single-click, double-click, and right-click actions. The default right-click menu is a single compact row placed directly below the character; it closes the companion using the current custom name without extra icons, separators, or warning styling.

The waveform beside the companion now starts real dictation. Recognized text is inserted at the current caret in the native composer. Users can insert raw recognition or select any already-connected DSH model for text cleanup, rewriting, or translation with a custom instruction. `⌥ Space` is the default in-app shortcut, and voice input can also be assigned to the companion's single-click, double-click, or right-click action. A failed model cleanup falls back to the raw transcript instead of losing the user's words. Settings retain aggregate dictation count, processed characters, and estimated time saved, never recordings or transcript history.

<a id="run"></a>

## Download and run

### Recommended: release bundle

Open [Releases](https://github.com/niushuanan/xiaozhuang-dsh/releases/latest) and download `xiaozhuang-dsh-v0.2.0-prebuilt-source.tar.gz`. The bundle contains the source plus the built Host, Client, and Web artifacts for the tagged commit, so it does not require a local build before the first launch.

Current packaged release: [Xiaozhuang DSH v0.2.0](https://github.com/niushuanan/xiaozhuang-dsh/releases/tag/xiaozhuang-v0.2.0) · [direct bundle download](https://github.com/niushuanan/xiaozhuang-dsh/releases/download/xiaozhuang-v0.2.0/xiaozhuang-dsh-v0.2.0-prebuilt-source.tar.gz) · [SHA-256 checksum](https://github.com/niushuanan/xiaozhuang-dsh/releases/download/xiaozhuang-v0.2.0/SHA256SUMS.txt).

Requirements:

- Node.js `^22.19.0` or `>=24.0.0`
- Corepack with pnpm `11.7.0`
- Git for development and Teamwork worktree features
- macOS Accessibility and Screen Recording permission only when desktop Computer Use is enabled

```sh
tar -xzf xiaozhuang-dsh-v0.2.0-prebuilt-source.tar.gz
cd xiaozhuang-dsh-v0.2.0
corepack enable
pnpm install --frozen-lockfile
pnpm dsh web
```

The Web UI starts at `http://127.0.0.1:3080` by default.

<a id="run-from-source"></a>

### Run from Git

```sh
git clone https://github.com/niushuanan/xiaozhuang-dsh.git
cd xiaozhuang-dsh
corepack enable
pnpm install --frozen-lockfile
pnpm run build:official
pnpm dsh web
```

## Configuration and privacy

The repository and release bundle contain no API keys, login sessions, account tokens, conversation data, or local DSH profile state. Configure model providers and grant operating-system permissions on your own machine. The model-usage plugin reads supported local account configuration at runtime and does not expose credentials to the browser. Voice input asks for microphone access on first use; audio is handled by the browser speech-recognition service and is not stored by the plugin. Recognized text is sent to the chosen model only when text refinement is enabled.

Computer Use and external collaborators are optional capabilities. Their package READMEs document permissions, provider requirements, failure behavior, and known limitations.

## Continuous iteration

This repository will continue to publish plugin improvements that have already proven useful in daily local work. Upcoming iterations will focus on whole-machine token reporting, clearer runtime details, a more efficient composer menu, smoother streaming output, and easier installation of the curated plugin set. AI voice input is now usable; later iterations can add more local recognition engines and a system-wide shortcut helper.

New features remain plugin-first: they should solve a visible user task, preserve the upstream runtime, and stay removable without breaking unrelated workflows.

## Development and contribution

Read the [development guide](docs/development.md), [architecture documentation](docs/architecture.md), and [contribution guide](CONTRIBUTING.md) before changing packages. Upstream fixes should still be proposed to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) when they are broadly applicable.

## License

[MIT](LICENSE). Third-party dependencies and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

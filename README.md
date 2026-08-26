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
| **Native plain chat** | Start a durable conversation without choosing a folder or granting Agent capabilities; the familiar chat page keeps model choice and history while removing Workspace, mode, Tool, and permission controls. |
| **Model usage** | A preloaded usage panel for DeepSeek, KIMI, GLM, and the signed-in GPT account, with explicit refresh, automatic refresh, quota windows, and reset times. |
| **Live session controls** | Agent preset changes during an existing conversation, model-aware reasoning defaults, and clearer placement for planning and team status. |
| **Commands, plugins and skills** | The composer plus button opens one native directory for images, Workspace references, the live official command catalog, plugins, and Skills; a pick inserts the slash command without executing it. |
| **Native Skill management** | Browse every personal, project, runtime, custom, and bundled Skill in a readable library, inspect its files inline, and import a file, folder, ZIP archive, or GitHub repository from one menu. |
| **Model input routing** | Explicit text and vision capability classification so native image models and tool-based vision fallbacks can coexist. |
| **Digital companion and microphone dictation** | **Whale Girl** lives above the composer and follows Agent state, with blue/black skins, a custom name, browser microphone dictation, and shortcuts. |
| **Multi-conversation split view** | Place up to four conversations side by side. Forks open beside their source by default, and conversations can be dragged from the directory into the current split view. |
| **Selection quote and memory** | Select text in a DSH message to quote it in place, open a same-project side chat, or ask AI to curate it into explicit user memory. |
| **Living global memory** | Edit separate user and AI memory documents; AI maintains its document daily and only recalls small relevant pieces for later work. |
| **Conversation export and sharing** | Export the current conversation as a complete text record or one PNG long image that omits reasoning and tool internals. |
| **Global Agent rules** | View and edit `~/.dsh/AGENTS.md` from Whale Girl settings. DSH re-reads it on every model step as the protected final system section, above presets, project rules, Skills, plugins, runtime context, and direct user prompts; provider-side policy remains outside DSH. |
| **Editable System Prompt** | General Settings exposes the current base System Prompt instead of an empty override. Saving writes `~/.dsh/SYSTEM.md`; DSH re-reads it on the next model step above every other product prompt and immediately below `AGENTS.md`. |
| **Searchable plugin catalog** | “Xiaozhuang's plugins” groups capabilities into Work, Conversation, and Data & Usage sections, searches names, descriptions, metadata, and categories, mirrors each capability's current product name and glyph, and links directly to this MIT repository for Stars. |
| **Selective plugin export** | Choose one, several, or all catalog capabilities and download one compact ZIP containing installable code, source, a hashed manifest, and conflict-aware AI installation instructions—without credentials, conversations, settings, dependencies, caches, or superseded media. |
| **Reorderable settings navigation** | Drag any Settings entry directly to a new position, or hold it for one second before moving; release to save the personalized order automatically. Every row keeps the same full navigation width regardless of label length. |
| **Continuous Adaptation** | Update on demand or monitor official DSH every six hours; every candidate receives one narrowly scoped compatibility Agent pass, while cutover stays idle-aware, data-preserving, and automatically reversible. |

The implementation lives in ordinary DSH packages and profile patch layers instead of a parallel application. The main additions include [`packages/computer-use/`](packages/computer-use/), [`packages/memory/`](packages/memory/), [`packages/client/ui-chat/`](packages/client/ui-chat/), [`packages/client/ui-adaptive-update/`](packages/client/ui-adaptive-update/), [`packages/client/ui-composer-add-menu/`](packages/client/ui-composer-add-menu/), [`packages/client/ui-skill-manager/`](packages/client/ui-skill-manager/), [`packages/client/ui-plugin-catalog/`](packages/client/ui-plugin-catalog/), [`packages/client/ui-selection-actions/`](packages/client/ui-selection-actions/), [`packages/client/ui-computer-use/`](packages/client/ui-computer-use/), [`packages/client/ui-provider-quota/`](packages/client/ui-provider-quota/), [`packages/client/ui-product-companion/`](packages/client/ui-product-companion/), [`packages/client/ui-multi-window/`](packages/client/ui-multi-window/), [`packages/session-query/session-log-export/`](packages/session-query/session-log-export/), and the subagent, conversation, preset, and plugin-loading extensions under [`packages/`](packages/).

The sidebar separates intent before a conversation starts: **Start work** follows the current Workspace flow, while **Start chat** opens or reuses a blank conversation under a dedicated **Chats** group. Chat uses an internal no-Tool preset, is not attached to a folder, and omits Workspace, mode, add-capability, and permission controls. It still preserves ordinary model selection, durable history, titles, search, and deletion behavior.

The native **Skill Management** Settings page turns the existing registry into a readable library. The first view uses the existing Skill glyph and source label in a responsive catalog; opening one replaces the catalog with a focused reader that keeps the compact, expandable human description above a file tree and a readable selected-file pane. `SKILL.md` frontmatter stays in the source but is omitted from the visual Markdown preview. When pure Chat is selected, management reads the latest work Session's catalog instead of hiding the user's installed Skills; Chat itself still receives no Skill or Tool capability. Personal Skills are writable while project, runtime, custom, and bundled sources remain read-only. One black **Import Skill** menu offers file, folder, and GitHub sources: file and folder choices open their picker immediately, while GitHub reveals an inline repository field. Sources are staged as untrusted data, normalized by `deepseek-official/deepseek-v4-flash-vision-exp`, validated, and atomically installed only into the personal Skill directory, so a failed adaptation leaves the previous Skill intact.

The native **持续适配** Settings page keeps the manual update button and adds an **自动更新 · 每 6 小时** capsule. Enabling it takes effect immediately and persists across restarts. A new official commit starts the same detached operation. Every candidate calls the compatibility Agent: a conflict-free merge gets one small, five-minute pass over direct upstream/plugin contract overlap and normally makes no edits; a conflicting merge has no artificial timeout but is constrained to actual conflict files and their direct compile dependencies. The fast path then prepares dependencies and performs one production build, with at most one narrow repair, instead of semantic deep review, updater regression suites, a separate repository-wide typecheck, Web replay, or a pre-cutover shadow boot. Its private Headless Agent is pinned to `deepseek-official/deepseek-v4-flash-vision-exp`.

The brief cutover still waits for live conversations to become idle, snapshots the existing DSH Home with copy-on-write storage, and rolls back both source and data when the restarted Host or Client does not become ready. Conversation logs and attachments remain in the original Home; temporary worktrees and private Agent homes are deleted, and only one rollback snapshot is retained. The original rc.2 self-adaptation preserved all 122 session files and 87 attachments; the current fast path keeps those safety boundaries without repeating its 283-check Web replay.

The plugin center is itself a native plugin. Every curated capability declares its category, package roots, and Cordis rows once; groups, counts, search results, runtime switches, and export choices derive from that catalog. **Export plugins** enters selection in the current list, while **Select all 16** means the complete catalog even when search hides rows or a plugin is disabled. The Host creates the ZIP in memory, includes only source, built code, and declared runtime assets, and adds `AGENTS.md`, `INSTALL.md`, and a SHA-256 manifest so another AI can install directly or adapt narrow conflicts against its target DSH version. No conversation, setting, credential, `node_modules`, cache, test tree, or superseded companion asset is included.

### Computer Use workspace

<img src="design-qa-computer-use-wide-final.png" alt="Computer Use browser workspace inside Xiaozhuang DSH" width="920">

### Model usage panel

<img src="design-qa-provider-quota-v4.png" alt="DeepSeek, KIMI, GLM, and GPT usage panel" width="720">

### Multi-conversation split view

Choose **Open Side by Side** from any non-empty session's `…` menu to add that conversation as another work block inside the current page instead of opening an operating-system window. Forking from either a directory row or a completed conversation turn now preserves the source as the main pane and opens the new branch beside it automatically. A conversation can also be dragged directly from the directory onto the conversation surface; the page shows a clear drop target and opens it as a secondary pane without triggering directory reordering. Each pane retains complete history, its own composer, and an isolated draft. Two panes divide the work surface evenly by default; further additions scale to four total panes. Dragging a divider grows one side and shrinks only its adjacent pane while every other pane adapts; double-click restores equal widths, and the chosen ratios persist for that conversation combination. Narrow panes automatically omit usage, export, browser, runtime stats, sidebars, and details while adaptive minimum widths preserve the title, views, transcript, essential controls, and input. Closing one pane leaves every other conversation in place.

### Selection quote and living memory

Selecting text inside one completed DSH message reveals a horizontal **Quote / Remember / Side Chat** toolbar immediately above the selection. Quote adds one numbered annotation above the current composer without repeating an `@selected text` token inside the editor, exposes the full source on hover, and marks the visible source until the reference is removed or sent. The hover preview is bounded by its current conversation pane and wraps long links or code instead of spilling into adjacent panes. The structured reference survives a page reload with the draft. Side Chat opens the same reference in a same-project conversation beside the source. Remember asks the current model to turn the selection and its bounded context into a reusable experience, writes only when the document changes, and then offers immediate undo. Quote and memory use their own quiet line icons; the same brain glyph identifies memory throughout the product.

Settings exposes user memory and AI memory as two separate global Markdown documents. User memory changes only through explicit selection or direct editing. After local noon, AI reviews the current day's new user and assistant conversations in bounded batches and maintains its own document by adding, merging, updating, and deleting knowledge. Later requests receive only a few matching blocks immediately before the current request, inside an explicit untrusted-data boundary.

### Digital companion: Whale Girl

**Whale Girl** is the default name, with “Whale” taken from DeepSeek's whale-inspired visual identity. The name is not locked: open the Settings entry bearing the character's current name and edit it in place. The navigation label, page heading, accessible name, context menu, and visibility switch update together and persist across reloads. The underlying plugin id remains stable, so renaming never affects hot-plugging or existing preferences.

She lives at the right edge directly above the real composer, with the visible silhouette touching its top border instead of covering draft text. Motion follows Agent state and the composer's measured position, not pointer hover. Working is deliberately calm: only the current conversation's start or a genuine task update plays one short prone focus pulse, then the character settles; background conversations update the task count and list without making her move. Conversation switching alone never triggers relocation: the plugin waits for layout to settle and starts only when the final anchor differs by at least 6 px. Idle, focus, waiting, and completion all remain prone. V14 character sheets keep the leaner lower silhouette and transparent negative space around the hips, raised legs, and boots. Pearl-white and very pale ice-blue forearm guards now separate the arms from the dark torso while black gloves, cobalt upper-arm plates, and the rest of each skin remain unchanged. All four states and both skins share this clearer material hierarchy and body proportion.

The companion stays visually above the product without claiming every click in her rectangle. A primary click over a covered native input, button, link, selector, or editor is handed to that underlying control first; only uncovered space retains the companion's configured single- and double-click action. Right click remains the companion's close/menu gesture.

When the composer truly moves, the plugin freezes the exact current character drawing and dimensions, then applies 48 V13 body-material masks derived from the real character silhouette. Boots, hair tips, and garment edges release first as small source-colored fragments while the face remains intact until the final phase. Coordinates change only after the character disappears, and arrival reverses the same masks to reconstruct her. The two round controls are companion-owned accessories: they stop accepting input and fade out early in departure, stay absent while the hidden coordinate changes, and return only as she reforms at the new anchor—never lingering at the former composer. A 1040 ms one-way phase and 28 ms neighbor crossfade reduce stepped motion. Every visible fragment comes from the current character bitmap—there is no independent foam cloud, doorway, transition identity, or size jump. The dedicated settings page still controls skins, size, task bubbles, and three independent shortcuts.

The waveform beside the companion calls the browser microphone directly and inserts the recognized transcript at the current caret in the native composer. The control always keeps its black plate and white waveform; listening animates only the waveform, never changes the companion's acting, and pointer hover shows no hint layer. `⌥ Space` is the default in-app shortcut, and microphone dictation can also be assigned to the companion's single-click, double-click, or right-click action. The product adds no recording countdown: when the browser rotates an underlying recognition segment, dictation renews automatically until the user clicks again, presses the shortcut, disables the plugin, or the system interrupts access. This path does not read the model catalog, call an LLM, perform AI rewriting, or retain recordings and transcript history.

<a id="run"></a>

## Download and run

### Recommended: release bundle

Open [Releases](https://github.com/niushuanan/xiaozhuang-dsh/releases/latest) and download `xiaozhuang-dsh-v0.4.2-prebuilt-source.tar.gz`. The bundle contains the source plus the built Host, Client, and Web artifacts for the tagged commit, so it does not require a local build before the first launch.

Current packaged release: [Xiaozhuang DSH v0.4.2](https://github.com/niushuanan/xiaozhuang-dsh/releases/tag/xiaozhuang-v0.4.2) · [direct bundle download](https://github.com/niushuanan/xiaozhuang-dsh/releases/download/xiaozhuang-v0.4.2/xiaozhuang-dsh-v0.4.2-prebuilt-source.tar.gz) · [SHA-256 checksum](https://github.com/niushuanan/xiaozhuang-dsh/releases/download/xiaozhuang-v0.4.2/SHA256SUMS.txt).

Requirements:

- Node.js `^22.19.0` or `>=24.0.0`
- Corepack with pnpm `11.7.0`
- Git for development and Teamwork worktree features
- macOS Accessibility and Screen Recording permission only when desktop Computer Use is enabled

```sh
tar -xzf xiaozhuang-dsh-v0.4.2-prebuilt-source.tar.gz
cd xiaozhuang-dsh-v0.4.2
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

The repository and release bundle contain no API keys, login sessions, account tokens, conversation data, or local DSH profile state. Configure model providers and grant operating-system permissions on your own machine. The model-usage plugin reads supported local account configuration at runtime and does not expose credentials to the browser. Microphone dictation asks for permission on first use; audio is handled by the browser speech-recognition service. The plugin stores neither recordings nor transcript history and never sends recognized text to a model.

Computer Use and external collaborators are optional capabilities. Their package READMEs document permissions, provider requirements, failure behavior, and known limitations.

Product-owned background AI features, including Skill import, living-memory maintenance, and compatibility adaptation, default to the inexpensive `deepseek-official/deepseek-v4-flash-vision-exp` route. Ordinary work and Chat conversations continue to use the model selected by the user.

## Continuous iteration

This repository will continue to publish plugin improvements that have already proven useful in daily local work. Upcoming iterations will focus on whole-machine token reporting, clearer runtime details, a more efficient composer menu, smoother streaming output, and easier installation of the curated plugin set. Microphone dictation remains a direct and predictable input feature; later iterations may add more local recognition engines and a system-wide shortcut helper.

New features remain plugin-first: they should solve a visible user task, preserve the upstream runtime, and stay removable without breaking unrelated workflows.

## Development and contribution

Read the [development guide](docs/development.md), [architecture documentation](docs/architecture.md), and [contribution guide](CONTRIBUTING.md) before changing packages. Upstream fixes should still be proposed to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) when they are broadly applicable.

This repository keeps source code and Issues public, but does not accept external pull requests. Use [Issues](https://github.com/niushuanan/xiaozhuang-dsh/issues) for bug reports and product suggestions; repository write access remains owner-only.

## License

[MIT](LICENSE). Third-party dependencies and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

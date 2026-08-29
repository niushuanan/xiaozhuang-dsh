# Xiaozhuang DSH

English | [中文](README.zh.md)

**Native plugins that turn DeepSeek Harness into a practical local workspace for both agent work and everyday chat.**

[![Latest release](https://img.shields.io/github/v/release/niushuanan/xiaozhuang-dsh?display_name=tag&sort=semver&label=release&color=111111)](https://github.com/niushuanan/xiaozhuang-dsh/releases/latest) [![DSH Plugin](https://img.shields.io/badge/DSH-dsh--plugin-4169e1)](https://github.com/topics/dsh-plugin) [![MIT](https://img.shields.io/badge/license-MIT-111111)](LICENSE) [![dshfind](https://dshfind.com/api/badge/niushuanan/xiaozhuang-dsh?lang=en)](https://dshfind.com/plugins/niushuanan/xiaozhuang-dsh?ref=badge)

<p align="center">
  <a href="https://dshfind.com/plugins/niushuanan/xiaozhuang-dsh?ref=badge"><img src="https://dshfind.com/api/card/niushuanan/xiaozhuang-dsh?lang=en" alt="Xiaozhuang DSH on dshfind" width="440"></a>
</p>

[Download](https://github.com/niushuanan/xiaozhuang-dsh/releases/latest) · [Explore all plugins](#plugins) · [Star the project](https://github.com/niushuanan/xiaozhuang-dsh) · [DeepSeek Harness upstream](https://github.com/deepseek-ai/deepseek-harness)

> An independent community distribution, not an official DeepSeek product. Upstream architecture, licenses, and attribution are preserved.

<p align="center">
  <img src="docs/assets/readme/plugin-catalog.png" alt="Xiaozhuang plugin catalog with 16 searchable, switchable, and exportable native plugins" width="800">
</p>

## What it is

Xiaozhuang DSH keeps the DeepSeek Harness core—agents, sessions, tools, models, and plugins—then fills the practical gaps around desktop control, pure chat, parallel work, Skills, long-term memory, usage visibility, and safe updates. New capabilities are built as native plugins whenever they can be independently switched, exported, and maintained.

| Start working | Start chatting |
| --- | --- |
| Bind a workspace and use agents, tools, permissions, and Skills to finish tasks. | Pick no folder and grant no execution access; just open a chat and attach images or text. |

## What you get

| User task | Product capability |
| --- | --- |
| **See everything in a workbench** | A right sidebar plus bottom panel: files, editor, real terminal, Git, embedded browser, background jobs, and side conversations, isolated per session. |
| **Finish complex work** | Teamwork, multiple agents, and isolated Git worktrees run in parallel under one coordinating agent. |
| **Manage knowledge and context** | Skill management, selection quotes, side chats, and two editable long-term memory documents. |
| **Keep conversations effortless** | Pure chat, DeepSeek history import, split conversations, in-session mode switching, image understanding, and continuous output. |
| **Understand model usage** | DeepSeek, KIMI, GLM, and GPT quotas plus per-session and whole-machine token details. |
| **Update without disruption** | Check upstream every six hours, adapt narrowly with an agent, switch while idle, and roll back when needed. |

<a id="run"></a>

## Get started

### Recommended: release bundle

[Xiaozhuang DSH v0.4.2](https://github.com/niushuanan/xiaozhuang-dsh/releases/tag/xiaozhuang-v0.4.2) already contains the built Host, Client, and Web artifacts.

```sh
tar -xzf xiaozhuang-dsh-v0.4.2-prebuilt-source.tar.gz
cd xiaozhuang-dsh-v0.4.2
corepack enable
pnpm install --frozen-lockfile
pnpm dsh web
```

[Direct download](https://github.com/niushuanan/xiaozhuang-dsh/releases/download/xiaozhuang-v0.4.2/xiaozhuang-dsh-v0.4.2-prebuilt-source.tar.gz) · [SHA-256](https://github.com/niushuanan/xiaozhuang-dsh/releases/download/xiaozhuang-v0.4.2/SHA256SUMS.txt)

<a id="run-from-source"></a>

### Run from source

```sh
git clone https://github.com/niushuanan/xiaozhuang-dsh.git
cd xiaozhuang-dsh
corepack enable
pnpm install --frozen-lockfile
pnpm run build:official
pnpm dsh web
```

Requires Node.js `^22.19.0` or `>=24.0.0` and pnpm `11.7.0`. The Web UI opens at `http://127.0.0.1:3080` by default.

<a id="plugins"></a>

## 16 native plugins

Open **Settings → Xiaozhuang Plugins** to search, switch, or export them. Exported ZIP files include source, a manifest, hashes, and AI installation instructions—not credentials, conversations, settings, dependencies, or caches.

### Work capabilities

#### 01 · Sidebar workbench

A VSCode-style right sidebar plus bottom panel: files and editor, real terminal, Git panel, sandboxed embedded browser (replacing the former browser bridge), background jobs, and Codex-style side conversations — session-isolated, splittable, and open to further plugins through `ctx.betterSidebar`.

<p align="center"><img src="docs/assets/readme/plugins/01-workbench.webp" alt="The workbench file panel, tab bar, and embedded browser entry" width="800"></p>

#### 02 · Teamwork ([standalone repository](https://github.com/niushuanan/dsh-teamwork))

Native `subagent` and `subagent_fork` workers handle routine parallel work. The primary agent selectively escalates difficult implementation or independent review to hot-pluggable Codex and Z Code experts through the same delegation contract, then checks and combines every result. Disabling an expert removes its callable tool; re-enabling it restores the tool without recreating the workflow.

<p align="center"><img src="docs/assets/readme/plugins/02-teamwork.webp" alt="Teamwork settings for concurrent collaboration and external experts" width="800"></p>

#### 03 · Concurrent worktree collaboration ([standalone repository](https://github.com/niushuanan/dsh-parallel-worktree))

Run parallel tasks in isolated Git worktrees, then inspect conflicts and merge safely into the current branch.

<p align="center"><img src="docs/assets/readme/plugins/03-parallel-worktree.webp" alt="Concurrent worktree switch and concurrency limits" width="640"></p>

#### 04 · Image understanding ([standalone repository](https://github.com/niushuanan/dsh-image-vision))

Upload an image from the composer plus menu—the same short path used for commands, plugins, and Skills.

<p align="center"><img src="docs/assets/readme/plugins/04-image-understanding.webp" alt="Composer menu with image upload, commands, plugins, and Skills" width="420"></p>

### Conversation experience

#### 05 · Whale Girl ([standalone repository](https://github.com/niushuanan/dsh-whale-girl))

Lives beside the composer and keeps voice input, task status, and configurable quick actions together.

<p align="center"><img src="docs/assets/readme/plugins/05-whale-girl.webp" alt="Whale Girl appearance and quick-action settings" width="800"></p>

#### 06 · Chat migration ([standalone repository](https://github.com/niushuanan/dsh-chat-migration))

One plugin installs both Chat mode and DeepSeek history import. Choose no folder and grant no agent execution access, then click Start chatting to continue the migrated conversations.

Open **Settings → Import conversations** and choose an official DeepSeek JSON or ZIP export. Preview, search, and select the independent DeepSeek conversation windows before migrating their original order, titles, timestamps, answers, and exported reasoning into the native chat list. Previously imported windows are marked and skipped instead of duplicated.

<p align="center"><img src="docs/assets/readme/plugins/06-chat-import.webp" alt="DeepSeek history import Settings page installed by the chat migration plugin" width="800"></p>

<p align="center"><img src="docs/assets/readme/plugins/06-pure-chat.webp" alt="Workspace-free chat composer installed by the chat migration plugin" width="812"></p>

#### 07 · Multi-conversation split view ([standalone repository](https://github.com/niushuanan/dsh-multi-window))

Place two sessions side by side in one workspace and continue each one independently.

<p align="center"><img src="docs/assets/readme/plugins/07-multi-window.webp" alt="Two DSH sessions displayed and controlled side by side" width="920"></p>

#### 08 · Selection actions ([standalone repository](https://github.com/niushuanan/dsh-selection-memory))

Select text in an answer to quote it, remember it, or open a side chat without breaking the reading flow.

<p align="center"><img src="docs/assets/readme/plugins/08-selection-actions.webp" alt="Quote, memory, and side-chat actions anchored to selected answer text" width="920"></p>

#### 09 · Long-term memory ([standalone repository](https://github.com/niushuanan/dsh-selection-memory))

Keep Selection Memory and AI Memory as two visible, editable, and restorable global documents.

<p align="center"><img src="docs/assets/readme/plugins/09-long-term-memory.webp" alt="Two editable global documents in Long-term Memory" width="800"></p>

#### 10 · Adaptive updates ([standalone repository](https://github.com/niushuanan/dsh-adaptive-update))

Check upstream every six hours, use an agent only for necessary compatibility work, switch while idle, and roll back on failure.

<p align="center"><img src="docs/assets/readme/plugins/10-adaptive-update.webp" alt="Adaptive update status, versions, and immediate check action" width="800"></p>

#### 11 · Skill management ([standalone repository](https://github.com/niushuanan/dsh-skill-manager))

Read a Skill's tagged summary, tree, and files directly, or adaptively import from a file, folder, ZIP archive, or GitHub.

<p align="center"><img src="docs/assets/readme/plugins/11-skill-manager.png" alt="Single-column Skill catalog with category tags, two-line introductions, and writable badges" width="800"></p>

#### 12 · Smooth output

Messages enter the conversation immediately while reasoning, tools, and answers appear as one continuous stream.

<p align="center"><img src="docs/assets/readme/plugins/12-smooth-output.webp" alt="Conversation stream presenting context, reasoning, and answer continuously" width="748"></p>

#### 13 · Agent presets

Switch a complete tool, prompt, and capability bundle inside a session, or duplicate one to customize it.

<p align="center"><img src="docs/assets/readme/plugins/13-agent-presets.webp" alt="Built-in Agent presets and the custom preset entry" width="800"></p>

### Data and usage

#### 14 · Model usage ([standalone repository](https://github.com/niushuanan/dsh-model-usage))

Check the DeepSeek balance and KIMI, GLM, and GPT quotas from the conversation header, refreshed every five minutes.

<p align="center"><img src="docs/assets/readme/plugins/14-model-usage.webp" alt="DeepSeek, KIMI, GLM, and GPT model usage cards" width="520"></p>

#### 15 · Session runtime details

Expand the current session's turns, steps, latency, time to first token, output speed, and cache hits.

<p align="center"><img src="docs/assets/readme/plugins/15-session-runtime.webp" alt="Current session steps, latency, speed, and token details" width="620"></p>

#### 16 · Token overview ([standalone repository](https://github.com/niushuanan/dsh-token-overview))

Review tokens, calls, and cost trends across local clients for today, seven days, this month, or all time.

<p align="center"><img src="docs/assets/readme/plugins/16-token-overview.webp" alt="Cross-client token metrics and time-of-day usage trend" width="800"></p>

## Data, models, and updates

- The repository and release bundle contain no API keys, login data, conversation records, or local DSH profile state.
- Skill import, long-term memory maintenance, and compatibility adaptation default to the inexpensive `deepseek-official/deepseek-v4-flash-vision-exp`; ordinary work and chat use the model selected by the user.
- Adaptive updates preserve the original DSH Home, conversations, and attachments. Failed candidates restore source and data, keep only one rollback snapshot, and remove temporary worktrees.

## Development and feedback

[Development guide](docs/development.md) · [Architecture](docs/architecture.md) · [Contributing guide](CONTRIBUTING.md) · [Issues](https://github.com/niushuanan/xiaozhuang-dsh/issues)

Propose broadly useful fixes to [DeepSeek Harness upstream](https://github.com/deepseek-ai/deepseek-harness). This repository keeps its source and Issues public but does not currently accept external pull requests.

## License

[MIT](LICENSE) · [Third-party dependencies and licenses](THIRD_PARTY_NOTICES.md)

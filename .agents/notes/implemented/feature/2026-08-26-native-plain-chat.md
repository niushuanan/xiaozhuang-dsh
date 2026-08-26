# Agent Note: Native plain chat outside Workspaces

Status: implemented

English | [中文](2026-08-26-native-plain-chat.zh.md)

## Problem

The Web product treats every new conversation as Agent work attached to a Workspace. A user who only wants to ask a question must still enter project-shaped navigation and receives controls that imply file access, modes, Tools, and operating permissions. Reusing the same visual page without a capability boundary would make a chat look harmless while retaining the authority to act.

## Decision

The sidebar presents two equal primary actions: **Start work** keeps the existing Workspace Session Intent, while the native `ui-chat` plugin contributes **Start chat** through `sidebar.primary.action`. The chat action reopens an existing blank Chat Session or creates one Session with the internal `chat` agent preset. One in-flight create owns repeated clicks.

The `chat` preset is the capability boundary. It composes a complete conversational persona without Tools or runtime project context and remains hidden from work-mode selectors and preset management. A Chat Session has no Workspace membership or cwd requirement. It keeps the ordinary Session log, model selection, title, transcript, search, and history lifecycle so the product does not create a parallel chat database.

The Workspace browser derives a leading **Chats** account from durable `agentPreset: chat` Session summaries. The conversation shell recognizes the same durable fact and removes Workspace, agent-preset, permission, mode, and add-capability controls while retaining the model and message path. The create response carries the preset so the first render is classified before a later list refresh.

**纯聊天** is the fifteenth Xiaozhuang plugin-catalog capability. Its switch controls the `ui-chat` entry; its export definition includes the package, internal preset, and every directly extended native source package so another DSH installation receives the complete behavior rather than an isolated button.

## Alternatives considered

**Add a Chat mode to every work Session.** A reversible visual mode would retain the Session's Workspace and could expose previously composed Tools again. It also makes one history alternate between two authority models.

**Build a separate Chat page and storage model.** This isolates the surface but duplicates transcript rendering, streaming, model selection, history, search, titles, and retention for no user benefit.

**Use a prompt-only instruction on the standard Agent.** Asking a tool-capable Agent not to act is not an enforceable product boundary and leaves work controls visible.

**Create a fresh blank Chat Session on every click.** This is simple but repeated clicks accumulate empty rows and make an immediate action feel unreliable. Reusing only blank Chat Sessions preserves deliberate completed conversations.

## Consequences

Users can enter a familiar conversation immediately without choosing a folder or understanding Agent modes. Chat history remains durable and searchable, but Chat cannot inspect or change the machine. The internal preset and the `agentPreset` summary field become the single cross-package classification fact; a future alternate Chat composition must preserve that fact or introduce an explicit durable Session kind.

The keyless assembled Web snapshot clicks the real bundle action and verifies the writable chat composer and absence of work-only controls. Focused runtime, sidebar, Workspace, conversation, preset, and orchestration tests cover creation, grouping, visibility, and duplicate-click behavior.

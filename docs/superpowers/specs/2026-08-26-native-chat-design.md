# Native Chat Design

English | [中文](2026-08-26-native-chat-design.zh.md)

## Product contract

The sidebar presents two equal primary actions: **Start work** keeps the current Workspace-aware agent flow, while **Start chat** opens a plain conversation immediately. Chat is not another page or editor mode. It reuses the existing conversation, history, title, model, search, rename, fork, and archive surfaces.

Chat Sessions live in a dedicated **Chats** group before the Workspace folders. They never display a folder picker, Workspace path, agent-preset switcher, access selector, slash/add menu, or work-only controls. Starting chat reuses an existing blank Chat Session; otherwise it creates one and selects it after the Host confirms creation, avoiding duplicate empty histories and double-click races.

## Capability boundary

`chat` is a shipped internal agent preset and the durable Session marker. Its composition contains only a complete conversational persona: no shell, filesystem, skills, web, planning, goals, delegation, workflows, or other model-facing tools. The UI derives its chat posture from the same durable preset recorded in the Session summary, so the product does not rely on hidden buttons as a security boundary.

The internal preset is not offered in ordinary work-mode pickers and a Chat Session does not expose preset switching. Existing Work Sessions and their default preset are unchanged.

## Native plugin ownership

`ui-chat` is the native browser plugin. It contributes the **Start chat** action through a sidebar-owned list slot and owns blank-chat reuse plus create/open orchestration. `ui-sidebar` continues to own column geometry and the **Start work** action. Client runtime carries the already-supported `agentPreset` create option. The conversation and Workspace browser project the durable `chat` marker into the simplified composer and dedicated history group.

## Failure and persistence

A failed Chat Session creation leaves the current screen usable and reports the diagnostic without creating a phantom row. Session logs, generated titles, and user data continue through the existing persistence path; no parallel chat database or folder is introduced. Empty Chat Sessions are reused, so repeated clicks do not accumulate empty records.

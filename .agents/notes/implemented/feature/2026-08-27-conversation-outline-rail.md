# Agent Note: The conversation gains a per-turn outline rail beside the message column

Status: implemented

English | [中文](2026-08-27-conversation-outline-rail.zh.md)

## Problem

Once a conversation runs long, reaching an earlier question means scrolling: the message column has no in-pane overview, no jump-to-turn, and no at-a-glance reminder of what each turn was about. Competing assistants render a compact per-turn rail beside the transcript (one dash per question, hover preview, click-to-jump), and the fork had nothing equivalent — the closest surface, ui-trajectory, is a debug ledger in a separate view tab, not transcript navigation.

## Decision

Add an additive conversation seat and a native presentation plugin, split along the existing layering:

- **ui-conversation owns the seat, the plugin owns the pixels.** The resident conversation shell declares `conversation.session.outline` (`single`, session scope) and mounts it as a zero-width, pointer-through overlay on the conversation column's left edge (hidden in embedded panes, split-pane layouts, and multi-pane groups). The new `@deepseek-ai/dsh-client-ui-outline` package fills it through `slots.inject()` and derives everything from the standard session kit — no owner data, no new services, no conversation-node changes, nothing model-visible.
- **Turns come from the chat snapshot.** Every visible `user` node opens a turn; steering, injected-context, and tool nodes never do. A turn's preview carries the truncated question and the opening text of its first assistant message; the dash width buckets the turn's total assistant text length so the rail echoes the transcript's shape. The rail renders only from three turns on.
- **Jump and scrollspy ride existing anchors.** The chat view already tags every rendered row with `data-chat-anchor-key` under the `[data-conversation-scroll]` scrollport; the rail scrollspies that DOM (rAF-throttled scroll events plus a flow ResizeObserver) to mark the turn at the reading line, and jumps by smooth-scrolling the turn's row to the top through the chat view's ordinary scroll bookkeeping.
- **Fork-convention compliance.** Registration, locale dictionary, invariant companion, package manifest, both tsconfig aggregates, bundle row, and web-app dependency follow the new-plugin checklist; component specs cover derivation, the threshold, jump geometry, and the hover preview; the package README carries the Model Experience and known-limitations sections with a recorded bilingual pair.

## Consequences

- Both Agentic Coding and plain-chat conversations get the rail (the seat is session-scoped shell chrome, indifferent to the agent preset); conversations under three turns show nothing.
- The rail follows rendered rows: turns in older history pages appear only once the reader pages them in, a running turn's preview fills when its assistant message lands, and extremely long conversations clip the rail rather than shrinking dashes further.
- The seat renders nothing without the plugin, and removing the plugin's Loader row retires the rail transactionally without touching the conversation shell.
- The bundle row ships the plugin by default; the running instance mounts it at the next `dsh web` boot (the current process's patch watcher is inert, so the profile-patch hot path could not mount it live).

## Alternatives considered

- **A position-proportional minimap.** Rejected: dash positions would jump while streaming grows the flow, and semantic anchors (one per turn) match how users recall their own questions.
- **The outline reads raw session events through its own ConversationNodes.** Rejected: the standard chat snapshot already assembles finalized user/assistant nodes; a second assembly would duplicate the chat target for no presentation gain.
- **Another ui-trajectory tab.** Rejected: the ledger is an inspection surface with its own viewport, not in-pane navigation; the rail must live beside the transcript it navigates.

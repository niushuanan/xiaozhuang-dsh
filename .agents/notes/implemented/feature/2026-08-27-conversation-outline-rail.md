# Agent Note: The conversation gains a per-turn outline rail beside the message column

Status: implemented

English | [中文](2026-08-27-conversation-outline-rail.zh.md)

## Problem

Once a conversation runs long, reaching an earlier question means scrolling: the message column has no in-pane overview, no jump-to-turn, and no at-a-glance reminder of what each turn was about. Competing assistants render a compact per-turn rail beside the transcript (one dash per question, hover preview, click-to-jump), and the fork had nothing equivalent — the closest surface, ui-trajectory, is a debug ledger in a separate view tab, not transcript navigation.

## Decision

Add an additive conversation seat and a native presentation plugin, split along the existing layering:

- **ui-conversation owns the seat, the plugin owns the pixels.** The resident conversation shell declares `conversation.session.outline` (`single`, session scope) and mounts it as a zero-width, pointer-through overlay on the conversation column's left edge (hidden in embedded panes, split-pane layouts, and multi-pane groups). The new `@deepseek-ai/dsh-client-ui-outline` package fills it through `slots.inject()` and derives everything from the standard session kit — no owner data, no new services, no conversation-node changes, nothing model-visible.
- **Turn boundaries come from row locations, not prompt rows.** Turn boundaries derive from each visible row's `location.turn`; prompt (`user`/`steering`) rows contribute their truncated text to the next turn's preview but never gate the derivation — the coding transcript does not render prompt rows, and a first history page can span turns whose prompts fall outside the loaded window. A turn's preview carries the question when a prompt row is present and the opening text of the turn's final assistant message either way; the dash width buckets the turn's total assistant text length so the rail echoes the transcript's shape. The rail renders only from three turns on.
- **The rail pages through the complete transcript.** The inject face carries the session object face's `loadOlder`; after the tail window opens, the rail requests one older page per settled head until history is exhausted. The rail releases its page key when reconnect/resync rebuilds the window, while `Session.loadOlder()` rejects a response from a superseded window generation before continuity checks or state mutation. This keeps automatic paging serial without letting a stale second page hide the remaining history.
- **Jump and scrollspy ride existing anchors.** The chat view already tags every rendered row with `data-chat-anchor-key` under the `[data-conversation-scroll]` scrollport; the rail scrollspies that DOM (rAF-throttled scroll events plus a flow ResizeObserver) to mark the turn at the reading line, and jumps by smooth-scrolling the turn's row to the top through the chat view's ordinary scroll bookkeeping.
- **Fork-convention compliance.** Registration, locale dictionary, invariant companion, package manifest, both tsconfig aggregates, bundle row, and web-app dependency follow the new-plugin checklist. Component and session specs cover derivation, the threshold, serial full-history paging, resync invalidation, jump geometry, and hover previews; an assembled browser scenario loads, fits, and jumps across 88 turns. The package README carries the Model Experience and known-limitations sections with a recorded bilingual pair.

## Consequences

- Both Agentic Coding and plain-chat conversations get the rail (the seat is session-scoped shell chrome, indifferent to the agent preset); loaded windows under three turns show nothing.
- Older pages fill progressively after the conversation opens; each loaded turn receives a dash, and the fixed-height rail shrinks dense slots to a two-pixel floor instead of clipping later turns. A running turn's preview fills when its final assistant message lands.
- The seat renders nothing without the plugin, and removing the plugin's Loader row retires the rail transactionally without touching the conversation shell.
- The bundle row ships the plugin by default.

## Alternatives considered

- **A position-proportional minimap.** Rejected: dash positions would jump while streaming grows the flow, and semantic anchors (one per turn) match how users recall their own questions.
- **The outline reads raw session events through its own ConversationNodes.** Rejected: the standard chat snapshot already assembles finalized user/assistant nodes; a second assembly would duplicate the chat target for no presentation gain.
- **Another ui-trajectory tab.** Rejected: the ledger is an inspection surface with its own viewport, not in-pane navigation; the rail must live beside the transcript it navigates.

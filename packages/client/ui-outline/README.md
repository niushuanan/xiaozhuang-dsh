# @deepseek-ai/dsh-client-ui-outline

English | [中文](README.zh.md)

Conversation outline rail plugin. `OutlineRail` fills the resident conversation shell's additive `conversation.session.outline` seat: one narrow dash rail beside the conversation column's left edge, rendered once the conversation spans at least three turns.

Every dash is one turn, derived from the standard chat snapshot through the session kit (`chat.order` + `chat.nodes`): turn boundaries follow each visible row's `location.turn` — prompt rows do not gate the derivation, because the coding transcript does not render prompt rows and a first history page can span turns whose prompts fall outside the loaded window. A `user`/`steering` row contributes its truncated text to the next turn's preview; the preview carries the question when one is present and the opening text of the turn's final assistant message either way, and the dash width buckets the turn's total assistant text length so the rail echoes the transcript's shape. A scrollspy follows the conversation scrollport (`[data-conversation-scroll]` under the same column) through its scroll events and the chat flow's resize, marking the last turn whose row sits above the reading line; the active dash darkens. Clicking a dash smooth-scrolls that turn's rendered row (`data-chat-anchor-key`) to the top of the viewport, riding the chat view's ordinary scroll bookkeeping. Hovering a dash previews the turn in a pointer-through card anchored to the dash.

A history page is bounded by message count, so a tool-heavy tail can contain only a few turns. While older history exists, the rail calls the session object face's `loadOlder` one page at a time until it reaches the history head. Paging starts only after the session is open, ignores a response superseded by reconnect/resync, and resumes from the rebuilt window instead of treating that stale page as a history gap. The fixed-height rail distributes every loaded turn across the available column range, shrinking dense conversations instead of clipping later dashes.

The seat itself is a zero-width, pointer-through overlay owned by the conversation skeleton, hidden in embedded panes, split-pane layouts, and multi-pane groups; the rail re-enables pointer events only on itself. The target slot is declared by another plugin, so `apply` uses `slots.inject()` to register for the declaration lifetime and re-register after the declaring slot is restored.

## Model Experience

None, as the outline is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The rail fills progressively** — older pages load sequentially after the tail opens, so a long conversation's earliest dashes appear as paging reaches them rather than blocking the conversation view.
- **The running turn's excerpt fills late** — a turn's preview shows its answer text once an assistant message exists; mid-stream turns keep a question-only preview until the message finalizes or the next turn opens.
- **Physical density still has a floor** — dashes shrink to two CSS pixels; a conversation with more turns than the column can represent at that floor cannot give every turn a large pointer target.

# @deepseek-ai/dsh-client-ui-outline

English | [中文](README.zh.md)

Conversation outline rail plugin. `OutlineRail` fills the resident conversation shell's additive `conversation.session.outline` seat: one narrow dash rail beside the conversation column's left edge, rendered once the current conversation has at least three user turns.

Every dash is one user turn, derived from the standard chat snapshot through the session kit (`chat.order` + `chat.nodes`): the turn opens at a visible `user` message, its preview carries the truncated question and the opening text of the turn's first assistant message, and the dash width buckets the turn's total assistant text length so the rail echoes the transcript's shape. Steering, injected-context, and tool nodes never open a turn. A scrollspy follows the conversation scrollport (`[data-conversation-scroll]` under the same column) through its scroll events and the chat flow's resize, marking the last turn whose row sits above the reading line; the active dash darkens. Clicking a dash smooth-scrolls that turn's rendered row (`data-chat-anchor-key`) to the top of the viewport, riding the chat view's ordinary scroll bookkeeping. Hovering a dash previews the turn in a pointer-through card anchored to the dash.

The seat itself is a zero-width, pointer-through overlay owned by the conversation skeleton, hidden in embedded panes, split-pane layouts, and multi-pane groups; the rail re-enables pointer events only on itself and renders nothing below the turn threshold. The target slot is declared by another plugin, so `apply` uses `slots.inject()` to register for the declaration lifetime and re-register after the declaring slot is restored.

## Model Experience

None, as the outline is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Turn detection follows rendered rows** — the scrollspy and jump walk the chat view's anchor DOM, so turns outside the loaded history window (older pages not yet paged in) have no dash until they are loaded.
- **The running turn's excerpt fills late** — a turn's preview shows its answer text once an assistant message exists; mid-stream turns keep a question-only preview until the message finalizes or the next turn opens.
- **Very long conversations clip the rail** — the rail caps at the column's height without paging, so extremely many turns overflow invisibly rather than shrinking further.

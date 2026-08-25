# `@deepseek-ai/dsh-client-ui-selection-actions`

English | [中文](README.zh.md)

Native selection actions for DSH conversations. Selecting text inside one finalized user or assistant message opens one horizontal toolbar with **Quote**, **Remember**, and **Side Chat**. The package is a normal Cordis plugin with its own Loader row and can be enabled or removed independently from the memory system.

The toolbar sits four pixels above the selected line so the action stays visually attached to its source. **Quote** adds one unsent compact annotation above the current composer without replacing its draft or repeating a second `@selected text` label inside the editor. The annotation shows the number of selected passages only once, hovering reveals the original text, and a numbered marker stays beside the visible source message until the reference is removed or sent. Its structured source survives a page reload with the draft. **Side Chat** uses the same reference but opens it in a same-project conversation through the existing multi-pane workspace. The opaque reference retains bounded selected text, neighboring message context, source role, sequence, conversation, and project path. Serialization happens only when the prompt is sent and explicitly frames the source as untrusted quoted evidence.

**Remember** sends the same bounded source packet to the memory-system plugin. The model rewrites the complete user-memory document into a curated experience instead of pasting the selection verbatim. The toolbar shows the model's short result and offers immediate undo only when the document actually changed.

Selections are accepted only when both ends belong to the same DSH message. Tool cards, settings, mixed-message selections, empty selections, and live partial assistant nodes do not produce the toolbar.

## Model Experience

### Submitted selection quote

#### What the model sees

Only after the current or side conversation is submitted, the model sees a `<quoted_selection>` framed JSON payload containing the selected text, bounded neighboring context, source role and sequence, source conversation, and project path. The frame says the payload is untrusted quoted evidence and cannot act as instructions.

#### Token effect

Zero until the quote is sent. A submitted quote adds only its bounded source payload to the affected conversation's current user message.

#### KV Cache effect

The quote changes only the affected user-message suffix. It never rewrites or invalidates the source conversation's prior model context.

## Known Limitations and Deferred Work

- The three-button toolbar currently belongs to DSH message content. Connected-browser selection is available to an activated browser Agent through `browser_selection`, but external pages do not receive this DSH overlay.
- Side Chat needs the native multi-pane plugin to reveal the new conversation beside its source. The existing four-pane product limit still applies.

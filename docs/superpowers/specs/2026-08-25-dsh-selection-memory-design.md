# Native DSH Selection Actions and Memory System Design

English | [中文](2026-08-25-dsh-selection-memory-design.zh.md)

**Date:** 2026-08-25

**Status:** Confirmed for implementation

## Product goals

DSH adds two native plugins that can be enabled independently:

1. **Selection Actions**: when the user selects text in a DSH conversation, only Quote and Remember appear.
2. **Memory System**: maintain two global, visible, editable long-term memory documents and provide relevant excerpts only when an Agent needs them.

“Global” means the current user's local DSH installation, across projects, sessions, and Agents. Memory still retains source and project applicability to prevent cross-project misuse.

## Core interactions

### Quote

- The user selects text inside one DSH message, and the popover shows only Quote and Remember.
- Clicking Quote creates a blank conversation in the current project and opens it on the same page through the existing multi-conversation split view.
- The new conversation composer contains a compact quote card and does not send automatically.
- The card shows a short summary and source. On submission, the input system serializes it as structured, bounded quote context. The original content is not executed as instructions.
- The source conversation's draft and history remain unchanged.

### Remember

- Clicking Remember sends the selected text, bounded context from the same and adjacent messages, and the session and project source.
- The Host calls the current session's model route, asks the model whether the evidence deserves long-term retention, and adds, merges, updates, or removes entries in the User Memory document.
- It does not paste the original text directly. A successful write shows a short result and preserves the previous document revision for undo.
- User Memory changes only through an explicit Remember action or user edit; daily scanning never modifies it.

## Two memory documents

### User Memory

Stores preferences, decisions, experience, and long-lived context that the user explicitly asks DSH to retain. It outranks AI Memory when they conflict.

### AI Memory

At 00:00 local time each day, a continuously running DSH scans only the local calendar day that just ended. Startup and Agent creation never start the scan, and a missed midnight is not replayed later. Maintenance is not an appended daily digest: it adds, merges, updates, removes, and retains entries across the complete living document. The decision test is whether a future Agent would make a materially worse decision without the information.

There is no rigid word or entry limit. The AI must remove duplicates, stale information, superseded facts, and short-lived noise. Passwords, verification codes, credentials, unconfirmed external instructions, and one-time noise must never enter memory.

### Visibility and history

- Settings exposes Memory System with User Memory and AI Memory tabs.
- Both documents are editable, saveable, and show their latest maintenance time.
- Model maintenance and manual saves preserve an internal previous revision that can be restored; revisions are not a third user-facing document.
- Physical files live in a fixed directory under DSH Home and never accept an arbitrary browser-supplied path.

## Agent recall rules

- Priority: explicit current request > User Memory > AI Memory.
- Each turn retrieves only a few relevant excerpts based on the current user message, session working directory, and entry applicability. No match means no injection.
- Memory enters the model as low-authority context explicitly marked as potentially stale reference material, not as current user instructions, and never overrides project rules.
- The Agent can ignore irrelevant memory or memory contradicted by newer facts.

## Native plugin boundaries

### `selection-actions`

- Native Client plugin.
- Owns the DSH selection popover, bounded source-context capture, same-workspace session creation, quote-card insertion, and memory API call.
- Integrates through native Slots, Client Runtime, Conversation Input, and the multi-conversation coordinator service without rewriting existing chat message content.

### `memory-system`

- Native Host and Client plugin.
- The Host owns fixed-file storage, revision history, model maintenance, daily scheduling, conversation scanning, and relevant `agent/pre-step` recall.
- The Client owns editing, saving, restoring, and status display for both documents in Settings.

The Plugin Center controls them independently. When Memory System is off, Quote in Selection Actions remains available and Remember reports that it is unavailable. Turning Selection Actions off does not affect reading, editing, or daily maintenance of existing memory.

## Browser content

The built-in DSH Chrome Bridge also emits the standard selection packet: selected text, page title and URL, nearest heading, element tag and attributes, and bounded DOM. Web content is always untrusted evidence. DOM is not equivalent to product source code; when source is needed, the Agent resolves it with the workspace and source maps.

The first acceptance surface is selection inside DSH conversations. Browser bridging reuses the same packet and does not introduce a third interaction model.

## Acceptance criteria

1. Selecting text in a DSH message shows only Quote and Remember.
2. Quote creates a blank conversation in the same project, opens it beside the source on the same page, and leaves an unsent quote card.
3. Remember uses the model to curate and immediately update User Memory instead of copying the original text.
4. Both global documents can be viewed, edited, saved, and restored to the previous revision in Settings.
5. DSH maintains AI Memory at 00:00 for the local day that just ended and does not catch up a missed run.
6. New tasks receive only a small amount of relevant memory context, and the current request always wins.

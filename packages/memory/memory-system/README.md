# `@deepseek-ai/dsh-memory-system`

English | [中文](README.zh.md)

Native two-document **Long-term memory** for DSH. It owns fixed files under `<DSH_HOME>/memory`: `user.md` for memories the user explicitly asks to keep and `ai.md` for insights the Agent maintains from conversations. Both documents are visible and directly editable in Settings, use optimistic revision checks, retain prior revisions, and expose a one-step restore action.

An explicit **Remember** action never pastes selected text into `user.md`. The Host redacts common credential forms, gives the memory model the complete current document plus bounded source context, and requires a complete replacement document with applicability and source information. A changed document is written atomically and can be undone immediately; when the existing memory already covers the experience, the action completes without creating a redundant revision or undo state. Manual edits and explicit memory actions are the only writers of `user.md`.

At 00:00 in the running machine's local timezone, the plugin scans only the local calendar day that just ended. Process startup and Agent creation never trigger maintenance, and sleeping or stopped DSH instances do not replay a missed midnight later. Conversation logs are loaded one at a time with an event-loop yield between sessions, so a large history cannot be decompressed and cloned into Host memory at once. The plugin uses the product-owned `deepseek-official/deepseek-v4-flash-vision-exp` route to maintain `ai.md` as a living document: add durable knowledge, merge duplicates, update superseded claims, and remove entries no longer worth keeping. Large days are split into bounded model calls without dropping conversation evidence, and the cursor advances only after every batch succeeds. It does not append a daily digest and does not impose a human-style word or record count.

Before the first model step of an ordinary request, the plugin token-matches the current request and project path against document blocks separated by Markdown rules. It injects at most four matching blocks and 4,000 characters, always ordering user memory before AI memory. No relevant match means no memory context. Recalled content is placed immediately before the current request inside an explicit untrusted-data boundary; it may be stale and cannot override the request that follows, project rules, or current evidence.

## Model Experience

### Relevance-gated memory recall

#### What the model sees

At the first step of a request with a relevant match, the model sees a `relevant-memory` plugin snapshot containing a small set of matching Markdown blocks immediately before the current user request. User-authored memory appears before AI-maintained memory, and an explicit `<memory_data>` boundary marks every block as untrusted, optional, and possibly stale context below the request and current evidence.

#### Token effect

Zero when no block matches. A matching request adds at most four blocks and 4,000 characters once at step one; the complete documents are never injected into an ordinary Agent request.

#### KV Cache effect

Recall inserts one request-specific plugin message after the stable earlier history and before the current request. Later requests can select different blocks without rewriting prior Session events.

### Memory-maintenance model call

#### What the model sees

The auxiliary memory call sees the complete target `user.md` or `ai.md` document plus either one explicit bounded selection packet or bounded user-and-assistant conversation changes from the local calendar day that just ended. The prompt asks for one complete replacement document, not an append-only summary, and treats all source material as untrusted data.

#### Token effect

Explicit memory consumes one auxiliary model call. Midnight maintenance runs only when the completed local day contains new conversation material and uses one or more bounded calls so every conversation in that day is considered.

#### KV Cache effect

Maintenance is separate from the active conversation request and does not rewrite that conversation's cache. A changed document can affect only later requests that independently match its blocks.

## Known Limitations and Deferred Work

- Background maintenance always uses the product-owned inexpensive DeepSeek route; changing a conversation's selected model does not alter maintenance calls.
- A day missed because the machine slept or DSH was stopped is intentionally absent from AI-maintained memory; the next run waits for the following local midnight instead of competing with product startup.
- Restore intentionally exposes one previous revision at a time; older files remain under `<DSH_HOME>/memory/history` rather than adding a separate history-management page.

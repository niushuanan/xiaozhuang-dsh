# `@deepseek-ai/dsh-memory-system`

English | [中文](README.zh.md)

Native two-document global memory for DSH. It owns fixed files under `<DSH_HOME>/memory`: `user.md` for memories the user explicitly asks to keep and `ai.md` for insights the Agent maintains from conversations. Both documents are visible and directly editable in Settings, use optimistic revision checks, retain prior revisions, and expose a one-step restore action.

An explicit **Remember** action never pastes selected text into `user.md`. The Host redacts common credential forms, gives the memory model the complete current document plus bounded source context, and requires a complete replacement document with applicability and source information. A changed document is written atomically and can be undone immediately; when the existing memory already covers the experience, the action completes without creating a redundant revision or undo state. Manual edits and explicit memory actions are the only writers of `user.md`.

After local noon, the plugin scans user and assistant conversation records since the last successful cursor. On the first run it starts at the beginning of the current local day instead of replaying the user's full history. Once a usable model route is known, it asks the model to maintain `ai.md` as a living document: add durable knowledge, merge duplicates, update superseded claims, and remove entries no longer worth keeping. Large days are split into bounded model calls without dropping conversation evidence, and the cursor advances only after every batch succeeds. It does not append a daily digest and does not impose a human-style word or record count. If DSH was not running at noon, the next active route performs the overdue pass.

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

The auxiliary memory call sees the complete target `user.md` or `ai.md` document plus either one explicit bounded selection packet or bounded user-and-assistant conversation changes after the successful daily cursor. The prompt asks for one complete replacement document, not an append-only summary, and treats all source material as untrusted data.

#### Token effect

Explicit memory consumes one auxiliary model call. Daily maintenance runs only when new conversation material exists and uses one or more bounded calls so every conversation in the successful-cursor window is considered.

#### KV Cache effect

Maintenance is separate from the active conversation request and does not rewrite that conversation's cache. A changed document can affect only later requests that independently match its blocks.

## Known Limitations and Deferred Work

- Daily maintenance needs a model route observed from an active DSH Agent. With no current or previously successful route, it waits instead of guessing a provider.
- The noon schedule follows the running machine's local timezone. Sleeping or stopped processes catch up after restart when a route becomes available.
- Restore intentionally exposes one previous revision at a time; older files remain under `<DSH_HOME>/memory/history` rather than adding a separate history-management page.

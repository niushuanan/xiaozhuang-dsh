# `@deepseek-ai/dsh-client-ui-chat`

English | [中文](README.zh.md)

Native plain-chat entry for the Web UI. The package fills `sidebar.primary.action` with **Start chat**, reuses one existing blank Chat Session when available, and otherwise creates exactly one Session with the internal `chat` agent preset before opening it. Concurrent clicks share the same in-flight creation, while each click still registers a fresh navigation intent: if **Start work** or another **Start chat** is clicked before creation settles, only the latest gesture may open its result. The ordinary **Start work** path and Workspace ownership remain unchanged.

The internal preset composes only `@deepseek-ai/dsh-persona`: it has no Tools, project instructions, working-directory context, permission selector, work-mode selector, Workspace picker, or add-capability entry. Chat Sessions still use the ordinary durable Session log, model selector, streaming transcript, title generation, search, and history loading. [`ui-workspace`](../ui-workspace/README.md) groups them under the leading **Chats** account, outside every Workspace; [`ui-conversation`](../ui-conversation/README.md) renders the same conversation shell with its work-only controls omitted.

`ChatStarter` reads the shared Session list at the click boundary. A blank Chat Session is reopened instead of duplicated; a new create sends `agentPreset: chat` without a Workspace or cwd, and the runtime immediately persists that preset in its list projection from the create response. The `chat` preset is product-internal and is omitted from agent-preset pickers and management.

## Model Experience

### Chat persona

#### What the model sees

The `chat` agent preset supplies a complete conversational persona and no Tools. It tells the model to answer as a general conversational assistant and not to claim file, shell, browser, project, or system actions.

#### Token effect

One short stable system prompt per Chat Session. Workspace instructions, project runtime context, Skill catalogs, and Tool schemas are absent, so Chat requests carry less fixed context than work Sessions.

#### KV Cache effect

The prompt is stable for the life of the Session and remains cache-friendly across turns.

## Known Limitations and Deferred Work

- **Chat is intentionally non-operational** — it cannot inspect files, run commands, browse, use Skills, or change the computer; start a work Session for those tasks.
- **A configured model is still required** — the feature removes Agent capabilities, not the provider requirement.
- **Chat shares the normal Session lifecycle** — deletion, title generation, search, and history retention use the same product behavior as work Sessions rather than a second storage system.

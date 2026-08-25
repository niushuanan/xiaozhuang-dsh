# @deepseek-ai/dsh-computer-use

English | [中文](README.zh.md)

Native Computer Use plugin for the Web composition. It registers `/computer <task>` and `/browser [isolated|real] <task>`. A command adds only its action set to the receiving Agent scope, then steers the task into that Agent; unrelated sessions and ordinary prompts carry no Computer Use tool schemas.

Desktop actions adapt the nine tools from `@qwen-code/open-computer-use` under `computer_*` names. `computer_click` accepts an accessibility `element_index`, not a global screen coordinate. DSH captures that element's accessibility ID or exact signature, serializes desktop actions, refreshes the target application's live tree immediately before each indexed action, and resolves the current index again. Moving, hiding, or minimizing a window therefore does not leave a queued click at its former screen position; if the target is no longer unique, the action stops and asks the model to inspect again. Coordinate drag remains an explicit fallback for gestures that accessibility actions cannot express. One desktop lease prevents two sessions from controlling the same global macOS UI concurrently, and `turn/end` releases the lease and sends upstream's turn-ended notification. The Settings action launches upstream permission onboarding; startup never opens it automatically.

The isolated browser launches system Chrome through Playwright and owns one clean, non-persistent context per DSH session. The connected browser uses the unpacked extension in `<DSH_HOME>/browser-bridge-extension`. Its pairing secret lives at `<DSH_HOME>/computer-use/bridge-token` with mode `0600`; the WebSocket accepts Chrome-extension origins and the loopback-only Settings endpoints never serve remote clients. The bridge tracks controlled tabs separately from DSH-created tabs; `browser_close` and session disposal close only the latter.

Config namespace `computer-use` contains `desktopEnabled` (default `true`), `browserEnabled` (default `true`), `defaultBrowserMode` (`isolated`), and `connectedBrowserNewTab` (`true`). Browser action results normally include a DOM/accessibility snapshot. `browser_selection` instead reads the user's current page selection as bounded JSON containing the text, URL, neighboring text, nearest heading, DOM selector, and source element HTML; the payload explicitly marks page content as untrusted evidence. When the active model route declares image input and an attachment store is mounted, the plugin also persists the screenshot and returns it as an image block.

The conversation-side browser workspace reuses this same `BrowserRuntime`; it does not launch a second browser stack. Loopback routes project the current mode, pause state, latest DOM and screenshot, and the most recent twelve steps for each Session. Address, back/forward/reload, and user takeover controls call the same action dispatcher. Point takeover uses normalized screenshot coordinates, mapped to the isolated Playwright viewport or the connected tab's visible area. Session disposal clears its Context, DSH-created Chrome tab, and workspace projection together.

## Model Experience

### Slash-activated desktop tools

#### What the model sees

After `/computer`, the receiving Agent sees `computer_list_apps`, `computer_get_state`, `computer_click`, `computer_secondary_action`, `computer_scroll`, `computer_drag`, `computer_type_text`, `computer_press_key`, and `computer_set_value`, plus one steering message carrying the user's task and verification requirement. The steering contract requires one indexed action at a time and fresh state after every action; the runtime independently revalidates indexed targets before execution.

#### Token effect

Conditional and retained for that live Agent scope; sessions that never invoke `/computer` pay zero direct tool-schema tokens.

#### KV Cache effect

The first `/computer` call appends the steering message and changes that Agent's tool catalog. Later desktop commands keep the same catalog and append only their task message.

### Slash-activated browser tools

#### What the model sees

After `/browser`, the receiving Agent sees `browser_open`, `browser_snapshot`, `browser_selection`, `browser_click`, `browser_fill`, `browser_press_key`, `browser_scroll`, `browser_tabs`, `browser_use_tab`, and `browser_close`, plus a steering message naming the selected browser mode and task. `browser_selection` returns only a selection the user has already made; it does not infer a target from the whole page.

#### Token effect

Conditional and retained for that live Agent scope; sessions that never invoke `/browser` pay zero direct tool-schema tokens.

#### KV Cache effect

The first `/browser` call changes that Agent's tool catalog. Switching modes later preserves the schemas and appends a new mode-specific task message.

## Known Limitations and Deferred Work

- **macOS desktop permissions are external** — Accessibility and Screen Recording must be granted to the upstream Qwen runtime before desktop actions can work.
- **Connected Chrome uses page scripts** — sites that require trusted physical input, CAPTCHAs, browser-internal pages, and inaccessible cross-origin frames may reject or hide actions; use the isolated provider or direct desktop control when appropriate.
- **One global desktop lease** — a second DSH session waits until the controlling session's turn ends because macOS input and foreground application state are global.

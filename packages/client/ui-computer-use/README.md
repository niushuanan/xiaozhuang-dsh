# @deepseek-ai/dsh-client-ui-computer-use

English | [中文](README.zh.md)

Web presentation plugin for native Computer Use. It contributes the `Computer Use` Settings section, binds the Host-owned `computer-use` settings namespace, reads loopback runtime status, starts macOS permission onboarding, reveals the unpacked Chrome extension, and copies its pairing information. It also contributes a resizable browser workspace beside a conversation: the user can switch between the isolated browser and paired Chrome, search or enter an address from one omnibox, create/switch/close real provider tabs, inspect the live screenshot, pause the Agent, take over with normalized point clicks, and inspect recent steps, page elements, and screenshot state. Sidebar, conversation, and browser remain three shared-width regions; dragging or keyboard-adjusting the separator grows one region while shrinking its neighbor instead of covering it. Narrow workspaces compress and horizontally scroll the tab strip without hiding the active page or primary controls.

Every `computer_*` and `browser_*` tool still uses a compact DSH-native action row instead of the generic card. An active browser task opens the workspace automatically; ordinary conversations do not preload a browser page or poll native desktop permissions while the workspace stays closed.

The workspace trigger reuses the same monochrome computer glyph as the Computer Use settings navigation, so both entry points remain visually consistent while inheriting the surrounding text color. Its tooltip opens below the header control instead of covering the neighboring Session log action; the workspace header's expand and close tooltips follow the same below-control placement.

The gear beside the workspace title opens one compact capability menu. It does not repeat the title, permission state, or connection state; it keeps only the two small Desktop control and Browser control switches while the header remains the single place for connection status.

## Model Experience

None, as this package renders settings and durable tool events in the browser; the Host Computer Use package owns every model-facing schema and steering message.

#### KV Cache effect

None; browser rendering does not assemble or send model requests.

## Known Limitations and Deferred Work

- **Historical screenshot preview stays in the conversation attachment system** — the side workspace shows only the live session's latest browser surface; complete historical tool images remain owned by the conversation attachment renderer.

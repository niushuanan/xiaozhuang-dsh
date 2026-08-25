# @deepseek-ai/dsh-client-ui-multi-window

English | [中文](README.zh.md)

Native DSH multi-conversation split-view plugin. When enabled, a session row's `…` menu gains **Open Side by Side** after Rename, Fork Session, and Archive Session. The selected conversation becomes another block inside the current page rather than an operating-system or browser popup.

Every block is a complete conversation surface with its own history, composer, draft, model control, and send action. Two conversations divide the available work surface evenly by default; additional panes scale up to four total conversations. A low-noise draggable divider sits between each pair: dragging changes only the two adjacent panes while the others keep the remaining space. Double-clicking a divider, or focusing it and pressing Enter, restores an equal distribution; arrow keys provide precise adjustment. Ratios persist locally for the current conversation combination and return after reload. Each secondary pane uses a same-origin isolated DSH document and its own session-selection key, so navigating or typing in one pane never moves or overwrites another pane's current selection or draft.

The current page keeps the primary navigation and digital companion. Secondary panes omit the sidebar, details column, companion, usage, export, browser entry, and runtime footer. This preserves the transcript and input when a conversation is compressed instead of shrinking every piece of desktop chrome. Divider constraints adapt to the total workspace width; enlarging one pane compresses only its neighbor while four-pane and narrow layouts keep usable composers without introducing page-level horizontal scrolling. Iframes temporarily stop receiving pointer input during a drag so an embedded conversation cannot intercept or stall resizing.

Pane identities persist locally across reloads. Deleted conversations and a conversation that becomes the primary are reconciled out automatically. Each pane has a small independent close action; closing one never changes the primary or interrupts another pane. The feature contributes through `sidebar.workspaces.sessionMenuAction` and `conversation.session.panes`, and the existing Loader id `ui-multi-window` remains stable for hot-plug compatibility.

## Model Experience

None, as the package only coordinates presentation, navigation, and existing conversation inputs without adding prompts, tools, model calls, or hidden Agent state.

#### KV Cache effect

None. All panes observe and operate existing Host sessions through the ordinary DSH path.

## Known Limitations and Deferred Work

- Four panes is a UI legibility limit, not a Session or Agent concurrency limit.
- The technical package id retains `multi-window` for compatibility; the user-facing product is an in-page multi-conversation split view.
- Hot-disabling the plugin removes the split surface and action immediately while keeping the persisted pane selection available if the user turns it back on.

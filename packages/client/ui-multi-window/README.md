# @deepseek-ai/dsh-client-ui-multi-window

English | [中文](README.zh.md)

Native DSH multi-window plugin. When enabled, a session row's `…` menu gains **Open in New Window** after Rename, Fork Session, and Archive Session. It opens a complete auxiliary DSH window directly on that session. The primary and every auxiliary window can navigate, compose, and send independently.

Current-session persistence is namespaced by window identity. The primary keeps the original `dsh.sessions.current` key, while each auxiliary window receives a stable window id and its own key. Changing sessions in a second window therefore never moves the primary highlight, and reloading one window cannot redirect another. Auxiliary windows update their own URL and title after navigation so a reload returns to that window's latest place.

Same-origin windows advertise liveness through a local lease heartbeat every two seconds. Up to four DSH windows may be active, including the primary. The action reserves a lease before calling `window.open`, releases it immediately if popup creation is blocked, releases normally on `pagehide`, and expires abnormal exits within seven seconds. Popup dimensions derive from available screen space and are slightly staggered; the plugin never resizes the primary or compresses four conversations into one page.

The digital companion belongs to the user's primary work surface. Auxiliary windows retain access to companion settings but do not register another cross-page character overlay, so opening two or four windows still renders **Whale Girl** only once.

The feature contributes its row through the `sidebar.workspaces.sessionMenuAction` slot and is controlled by the Loader row `ui-multi-window`. Disabling the plugin removes the menu capability and lease coordinator immediately. It deliberately does not force-close already-open windows, which could destroy an unsent draft or interrupt visible work.

## Model Experience

None, as this package only coordinates browser windows, navigation, and menu presentation and registers no prompt, tool, message, or model request.

#### KV Cache effect

None. Windows share the Host's existing session facts, but each is only an independent UI observation and input surface.

## Known Limitations and Deferred Work

- New windows remain subject to browser or desktop-shell popup policy and must be opened from the user's explicit menu click.
- Four windows is a product limit, not a Session or Agent concurrency limit.
- Hot-disabling the plugin leaves existing auxiliary windows open; it removes only the creation entry and live window-count coordination.

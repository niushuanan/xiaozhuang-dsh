# @deepseek-ai/dsh-client-ui-product-companion

English | [中文](README.zh.md)

Native cross-page product companion for Xiaozhuang DSH. The plugin contributes one additive entry to `shell.overlay`, so the character stays mounted while the user switches conversations, Settings sections, and product pages. It reads the existing session-list projection and selects a generated frame without making another model request:

- **Working** while any task is running.
- **Waiting** when a task needs approval, an answer, or plan review.
- **Success** for a short moment when running work settles.
- **Idle and sleep** while the workspace is quiet.

Clicking the character opens a compact status panel with the current task, running/waiting counts, two visual skins, and a reset-position action. Dragging moves it anywhere in the current viewport; the chosen skin and position persist locally. A waiting task receives one small speech label even when the panel is closed. Both blue and black skins include five transparent, preloaded frames, so the first state change does not wait for an image download.

The Host half serves only ten whitelisted immutable PNG assets from `/plugins/ui-product-companion/assets`. The browser half owns all state derivation and interaction. Removing or disabling the Loader row removes the companion without altering sessions, the sidebar, or the conversation UI.

## Model Experience

None, as the companion consumes already-projected session state and never assembles a prompt or sends a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The companion intentionally has no second chat box, feeding loop, currency, growth system, or minigame. Those concepts duplicate the main product workflow and add ongoing attention cost.
- A session that completed before this plugin mounted does not replay the success frame; only live running-to-settled transitions celebrate.
- Position persistence is viewport-relative. A large display change clamps the character into the new viewport instead of preserving a semantic attachment point.

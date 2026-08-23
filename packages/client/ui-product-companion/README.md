# @deepseek-ai/dsh-client-ui-product-companion

English | [中文](README.zh.md)

Native cross-page product companion for Xiaozhuang DSH. The plugin contributes one additive entry to `shell.overlay`, so the character stays mounted while the user switches conversations, Settings sections, and product pages. It reads the existing session-list projection and selects a generated frame without making another model request:

- **Working** while any task is running.
- **Waiting** when a task needs approval, an answer, or plan review.
- **Success** for a short moment when running work settles.
- **Idle and sleep** while the workspace is quiet.

The character is the interaction surface. A click now triggers a short reaction exactly where she is; it never moves her back to the directory or opens another card. Dragging is the only direct action that changes position. Dropping near the directory, header, or composer snaps to that real surface, and each habitat has its own six-frame animation rather than reusing a generic pose. Quiet periods blink, stretch, watch, and rest in place. Running or waiting work moves the companion beside the composer only when task following is enabled, then plays the generated task sequence and one short completion response.

One compact bubble mirrors the live turn without pretending that an indeterminate model response has a percentage: **Responding · 12s**, **Waiting for you · 12s**, then **Completed · 12s**. The elapsed value is measured from the running transition observed by the mounted browser plugin. It reads no prompt or generated message text. Preferences live in a dedicated **Whale Companion** Settings section with blue/black skin selection, status bubble, task following, and one explicit reset action. Semantic habitat, free position, skin, and behavior preferences persist locally. The two skins share 60 generated transparent frames across sidebar, header, composer, task, and rest sequences; the selected skin's 30 frames are preloaded.

The Host half serves only the 60 whitelisted immutable runtime PNG assets from `/plugins/ui-product-companion/assets/v2`. The browser half owns all state derivation, frame timing, and interaction. Removing or disabling the Loader row removes the companion without altering sessions, the sidebar, or the conversation UI.

## Model Experience

None, as the companion consumes already-projected session state and never assembles a prompt or sends a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The companion intentionally has no second chat box, feeding loop, currency, growth system, or minigame. Those concepts duplicate the main product workflow and add ongoing attention cost.
- A session that completed before this plugin mounted does not replay the success frame; only live running-to-settled transitions celebrate.
- Elapsed time is an honest browser-observed duration. Reloading the page in the middle of a task restarts that local counter instead of inventing an earlier start time.
- A freely dropped position remains viewport-relative and is clamped after a large display change. Directory, header, and composer attachments are semantic and are recalculated from the current page layout.

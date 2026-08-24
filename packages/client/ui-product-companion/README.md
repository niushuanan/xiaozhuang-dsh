# @deepseek-ai/dsh-client-ui-product-companion

English | [中文](README.zh.md)

Native cross-page digital companion for Xiaozhuang DSH. The default character is **Whale Girl**, with “Whale” carrying DeepSeek's whale-inspired visual identity. Users can rename her directly in the dedicated **Digital companion** settings page; the accessible name, action menu, visibility switch, and page heading share one persisted preference while the technical plugin id and settings navigation label remain stable. The plugin contributes one additive entry to `shell.overlay`, so the character stays mounted while users switch conversations and product pages. It reads the existing session-list projection and selects a generated frame without making another model request:

- **Working** while any task is running.
- **Waiting** when a task needs approval, an answer, or plan review.
- **Success** for a short moment when running work settles.
- **Idle and sleep** while the workspace is quiet.

The companion now lives at the right edge directly above the real composer instead of roaming across unrelated product surfaces. Her visible silhouette touches the composer's top edge without covering its text. Quiet, working, waiting, and completion states remain prone. When sending a message or a layout reflow moves the composer, a six-drawing doorway transition replaces the former crawl: she stands at the old anchor, opens the portal, disappears, switches coordinates only while the closed doorway hides her, then re-enters by playing the same drawings in reverse and returns to the prone loop. The root footprint, image plane, longest visible body axis, and composer baseline stay fixed throughout; runtime movement never applies `scale()`. A `MutationObserver`/`ResizeObserver` measurement loop follows the real geometry, while repeated geometry changes during one transition coalesce into the latest target. If the composer does not move, neither does the character. Single click, double click, and right click remain independently configurable. Their defaults focus the composer, start a new conversation in the current workspace, and open a product menu with new-conversation, focus, and close actions. The animation uses a 24 fps exposure sheet sampled by `requestAnimationFrame`: quiet acting is held on twos or threes and predecoded drawings swap on one permanently opaque image element.

One compact bubble shows the current live conversation title, phase, and observed elapsed time without pretending an indeterminate response has a percentage. The number below the character is the product-wide total of running or attention-blocked conversations. Clicking it expands prioritized task bubbles: user-blocked work first, then the current conversation and recently updated background work. Bubbles enter from the character upward with short staggered motion. Opening one navigates through the existing Session Runtime while keeping the whole task layer open, so the user can continue switching among concurrent work; clicking the number again, pressing Escape, or clicking outside collapses the bubbles back toward the character with the reverse stagger. The voice waveform on the left is an explicitly disabled preview of future AI voice input; its tooltip says that it is coming soon and it never pretends to work. Draft detection retains only whether the composer is non-empty; it does not store prompt or generated message text. Preferences live in a dedicated **Digital companion** Settings section with custom naming, blue/black skin selection, Standard/Large size, gesture bindings, visibility, and the status-bubble switch. Closing from the character persists locally and the same Settings switch restores it. The character steps out while a modal Settings surface is open and returns when that surface closes, so configuration controls stay clear. V8 uses 124 transparent runtime assets across four prone semantic loops and one fixed-scale doorway transition. The clearly adult heroine keeps the accepted face, slender silhouette, DeepSeek whale jewelry, and glamorous non-explicit costume language. The selected skin's 62 assets are decoded up front. Deep Sea Blue is vivid cobalt and cyan; Night Black is a deterministic obsidian-and-silver palette with only small blue signals. Runtime pose transforms never rescale the character, and assets are checked for clear edges, camera consistency, matching blue/black silhouettes, stable semantic loops, and portal optical-size parity.

The Host half serves only the 124 whitelisted immutable runtime PNG assets from `/plugins/ui-product-companion/assets/v8`. The browser half owns state derivation, draft-presence detection, 24 fps exposure-sheet playback, composer geometry observation, and the two-phase doorway transition. Non-modal product panels such as Model Usage do not unmount it; only a true full-surface modal temporarily yields the canvas. Removing or disabling the `ui-product-companion` Loader row hot-unmounts the digital companion without altering sessions, the sidebar, the conversation UI, or another plugin, and enabling that row mounts the same independent entry again without restarting the Web process.

## Model Experience

None, as the companion consumes already-projected session state and never assembles a prompt or sends a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The companion intentionally has no second chat box, feeding loop, currency, growth system, or minigame. Those concepts duplicate the main product workflow and add ongoing attention cost.
- A session that completed before this plugin mounted does not replay the success frame; only live running-to-settled transitions celebrate.
- Elapsed time is an honest browser-observed duration. Reloading the page in the middle of a task restarts that local counter instead of inventing an earlier start time.
- The companion appears only where the real composer exists; Settings dialogs and pages without a composer intentionally leave the surface clear.
- AI voice input is currently a disabled preview and never requests microphone permission. The actual voice-input plugin remains a future iteration.

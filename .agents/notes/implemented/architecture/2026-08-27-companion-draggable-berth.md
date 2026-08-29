# Agent Note: The companion's composer berth is a draggable, persisted ratio

Status: implemented

English | [中文](2026-08-27-companion-draggable-berth.zh.md)

## Problem

The companion was hard-pinned to the composer's right edge (`x = composer.right − width − 14`) with `data-side="right"` as a literal. The store still carried `position`/`home`/`setPosition`/`resetPosition` from a pre-redesign free-drag era that no component read, and `habitats.ts` (semantic home resolution + snap distance) was dead alongside them. The user could not move her at all, and "where she sits" had no representation to persist.

## Decision

The horizontal berth is now one persisted number: `composerOffsetRatio ∈ [0, 1]` — the fraction of the composer card's usable width (card width minus a 6px left and 14px right inset minus the sprite) at which her left edge sits. Absent means 1, the historical right berth, so existing users see no change.

- **Geometry lives in `composer-anchor.ts`** as three pure functions (`composerXForRatio`, `composerRatioForX`, `composerYForTop`) with clamp and narrow-card behavior; `measureComposerAnchor` consumes them, so every existing observer path (MutationObserver/ResizeObserver/scroll/settle timers) now re-derives the anchor from the persisted ratio — a composer move or resize returns her to the same relative spot, which is exactly the dissolve-teleport contract already documented.
- **The drag is a window-level pointer gesture** started from the sprite with a 5px horizontal threshold: below it, the existing click/click-through semantics run untouched; above it, `renderedPosition` follows the pointer (grab-offset preserved), teleporting is cancelled, and pointerup commits `setComposerOffsetRatio(ratio)` through the store, swallows the synthetic click and the pending click-through, and bumps the layout revision so the anchor effect re-measures to the same spot (no post-drag animation). `pointercancel` releases without committing.
- **The left round control is an opposite-side shortcut**: ratios above the 0.5 midpoint show a left arrow and commit 0.1; ratios at or below the midpoint show a right arrow and commit 0.9. The control calls the existing two-phase material dissolve before persisting the target ratio, so the character and both round controls disappear at the current berth and reconstruct at the destination instead of sliding across the composer.
- **Dead weight removed**: `position`/`home` fields, `setPosition`/`setHome`/`resetPosition` actions, the `CompanionHabitat` type, and `habitats.ts`. Persisted records carrying the retired keys are ignored on read (localStorage is private, pre-contract data).
- The sprite advertises the affordance (`cursor: grab`, `touch-action: none` so a touch drag cannot scroll the page behind her) and reports state (`data-dragging`, plus `data-side` now derived from the live ratio).

## Consequences

- "Put her where I want on the input bar" survives layout churn by construction, not by coordinate replay — the persisted fact is relative, the composer is the only frame of reference.
- Sprite click, double-click, right-click, dictation shortcuts, and click-through-to-composer gestures keep their prior behavior; a 5px jitter cannot start a drag, and a drag can never submit a click on release.
- Known trade-off: vertical placement stays authored (she always sits on the composer's top edge). A free 2-D placement would need a second persisted axis and a drop-target story for composer-less pages; deferred until asked for.

## Alternatives considered

- **Absolute viewport coordinates (the old `position` field)** — rejected: every composer move would need replay heuristics, and a maximized/restore cycle or pane split would strand her off-card.
- **Named left/center/right berths in Settings** — rejected: the in-place opposite-side control solves the common obstruction with one click, while direct drag still covers exact placement without another settings concept.
- **Sliding across the composer** — rejected: the existing material dissolve keeps the character and her controls visually unified and avoids crossing the user's draft.

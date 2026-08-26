# Agent Note: The companion's composer berth is a draggable, persisted ratio

Status: implemented

English | [中文](2026-08-27-companion-draggable-berth.zh.md)

## Problem

The companion was hard-pinned to the composer's right edge (`x = composer.right − width − 14`) with `data-side="right"` as a literal. The store still carried `position`/`home`/`setPosition`/`resetPosition` from a pre-redesign free-drag era that no component read, and `habitats.ts` (semantic home resolution + snap distance) was dead alongside them. The user could not move her at all, and "where she sits" had no representation to persist.

## Decision

The horizontal berth is now one persisted number: `composerOffsetRatio ∈ [0, 1]` — the fraction of the composer card's usable width (card width minus a 6px left and 14px right inset minus the sprite) at which her left edge sits. Absent means 1, the historical right berth, so existing users see no change.

- **Geometry lives in `composer-anchor.ts`** as three pure functions (`composerXForRatio`, `composerRatioForX`, `composerYForTop`) with clamp and narrow-card behavior; `measureComposerAnchor` consumes them, so every existing observer path (MutationObserver/ResizeObserver/scroll/settle timers) now re-derives the anchor from the persisted ratio — a composer move or resize returns her to the same relative spot, which is exactly the dissolve-teleport contract already documented.
- **The drag is a window-level pointer gesture** started from the sprite with a 5px horizontal threshold: below it, the existing click/click-through semantics run untouched; above it, `renderedPosition` follows the pointer (grab-offset preserved), teleporting is cancelled, and pointerup commits `setComposerOffsetRatio(ratio)` through the store, swallows the synthetic click and the pending click-through, and bumps the layout revision so the anchor effect re-measures to the same spot (no post-drag animation). `pointercancel` releases without committing.
- **Dead weight removed**: `position`/`home` fields, `setPosition`/`setHome`/`resetPosition` actions, the `CompanionHabitat` type, and `habitats.ts`. Persisted records carrying the retired keys are ignored on read (localStorage is private, pre-contract data).
- The sprite advertises the affordance (`cursor: grab`, `touch-action: none` so a touch drag cannot scroll the page behind her) and reports state (`data-dragging`, plus `data-side` now derived from the live ratio).

## Consequences

- "Put her where I want on the input bar" survives layout churn by construction, not by coordinate replay — the persisted fact is relative, the composer is the only frame of reference.
- Click, double-click, right-click, voice, and the click-through-to-composer gestures keep their exact prior behavior; a 5px jitter cannot start a drag, and a drag can never submit a click on release.
- Known trade-off: vertical placement stays authored (she always sits on the composer's top edge). A free 2-D placement would need a second persisted axis and a drop-target story for composer-less pages; deferred until asked for.

## Alternatives considered

- **Absolute viewport coordinates (the old `position` field)** — rejected: every composer move would need replay heuristics, and a maximized/restore cycle or pane split would strand her off-card.
- **Named berths (left/center/right buttons in settings)** — rejected for this pass: a direct drag is the shortest intuitive path, and the ratio already encodes every stop in between; discrete buttons can layer on top later without a storage change.

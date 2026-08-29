# Agent Note: Interrupted companion anchor transitions preserve the visible departure berth

Status: implemented

English | [中文](2026-08-30-interrupted-companion-anchor-transition.zh.md)

## Problem

Conversation changes use a 360 ms trailing-edge window because the destination page can briefly render an intermediate composer before reaching its final layout. When a user entered the centered new-conversation page and opened history before that window completed, the second session change cancelled the pending move. The companion's rendered position still held the older bottom berth, while the latest measured anchor already represented the centered page. Once history settled back at the same bottom berth as the stale rendered position, the distance check incorrectly concluded that no transition was needed. The first click therefore produced no dissolve or movement; a later conversation switch appeared to wake the feature up.

## Decision

The anchor effect now treats the rendered coordinate and the latest measured composer coordinate as separate facts during a page transition. If another session identity arrives while the previous settling window is still open, the effect captures the previous page's latest measured anchor before overwriting it, adopts that anchor as the visible departure berth, cancels the obsolete transition, and opens the normal settling window for the new destination. The final distance comparison uses this captured departure berth, so the first stable destination starts the existing two-phase material dissolve even when its coordinates happen to equal an older rendered position.

This rule applies only to an interrupted cross-page settling window. An ordinary conversation switch still coalesces transient composer geometry for 360 ms, and geometry changes inside one conversation continue to attach the companion directly to the composer without dissolution.

## Testing

The component regression starts on an existing conversation, exposes the centered new-conversation composer, leaves it before the settling timer fires, then restores the existing conversation's bottom composer. It requires the first return to depart from the centered berth, enter the dissolve track, and arrive at the bottom berth. Existing regressions continue to pin direct same-page attachment, ordinary cross-page dissolution, and suppression when a transient reflow returns to the same anchor.

## Alternatives considered

**Remove or shorten the settling window.** Rejected because conversation pages can publish a short-lived bottom composer before their actual layout appears; moving immediately would reintroduce a visible trip through an intermediate berth.

**Dissolve for every measured geometry change.** Rejected because textarea growth, attachments, and pane reflow are ordinary changes within one conversation. The companion is part of that composer chrome and must follow it directly rather than repeatedly disappearing.

## Consequences

Rapid new-conversation-to-history navigation now produces the same first-click movement as a fully settled page. On interruption, the companion may make one immediate correction to the previous page's latest measured berth before departure; that coordinate was already the page's visible composer anchor and is preferable to retaining an older, unrelated page position. No new persisted state, product control, timeout, or protocol is introduced.

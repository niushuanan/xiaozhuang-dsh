# Agent Note: Add a native state-driven product companion

Status: implemented

English | [中文](2026-08-24-native-product-companion.zh.md)

## Problem

Xiaozhuang DSH has several useful native plugins, but the product has no continuous character that survives page changes or turns background Agent state into a lightweight ambient signal. Existing DSH pet plugins prove that idle, working, waiting, completed, error, dragging, and sleep states are understandable. Their broader feeding, currency, growth, minigame, multi-pet, and second-chat systems would duplicate the main DSH workflow and add a large new state domain.

A companion implemented inside a particular sidebar, conversation, or Settings component would disappear when that owner unmounts. A pure decorative animation would also consume screen space without helping the user notice pending approvals or ongoing background work.

## Decision

Add `@deepseek-ai/dsh-client-ui-product-companion` as a dual-face native plugin. Its browser half contributes one root-scoped entry to the additive `shell.overlay` slot. The companion therefore remains mounted above all app columns and pages without replacing any layout owner. It consumes the existing session-list projection and deterministically derives working, waiting, short success, idle, and sleep states. It makes no model request and owns no session truth.

The Host half exposes only ten whitelisted immutable PNG frames. ImageGen produced one adult anime whale-hood identity, five task poses, and blue/black palette variants. The build assets were background-cleaned, trimmed, normalized to transparent 512 × 512 canvases, compressed, and preloaded by the browser.

The visible surface stays small and borderless. The character itself is the direct-manipulation surface: click cycles through currently available semantic habitats, and a drag snaps to the nearby directory, header, or composer edge while still allowing a free drop. Habitats are measured from the real layout instead of stored as brittle coordinates. Each habitat chooses a distinct acting pose; hover adds gaze tracking, quiet time adds occasional gestures and movement, active work prefers the composer, and completion adds a short celebration.

GitHub research changed the status contract. OpenAI Codex maps pet animations to semantic running, waiting, review, and failed notifications; its public source and issue history also show why an active animation must follow authoritative task state instead of expiring on a fixed timer. SHIN620265/claude-pet proves that a companion can surface thinking, waiting, background-running, done, and interrupted states while keeping privacy controls separate. OpenPet and CoPet separate direct pointer interaction from a Settings center and expose event reactions, autonomous motion, reduced motion, and message-display choices. DSH adopts only the parts that solve its core task: a compact live phase plus browser-observed elapsed time, no fake percentage, no prompt or generated-text read, and no extra Agent call.

The root store is shared by `shell.overlay` and a dedicated `settings.section`. The character click path therefore remains movement-only, while Settings owns blue/black skin selection, status-bubble visibility, automatic task following, and reset position. Old persisted records fall back to the new enabled defaults. The design intentionally excludes feeding, growth, currency, games, a status card, and a second chat.

## Alternatives considered

**Place it inside the sidebar.** This would make the default pose feel attached to the directory, but the companion would disappear in collapsed, Settings, and non-sidebar layouts. The shell overlay preserves the visual placement while keeping the character cross-page.

**Add an independent pet backend and model conversation.** This enables more personality, but creates another prompt, history, cost, and failure path. The existing session projection already contains the useful product signals.

**Use CSS recoloring for a black skin.** This is cheap but changes skin, hair, whites, and accents together. Separate generated palette frames keep identity and cyan accents coherent.

## Consequences

The companion can be enabled or removed as one Loader plugin row. It alerts the user to waiting tasks, mirrors active work with honest observed time, celebrates live completion, survives page changes, and feels attached to the current product surface without owning that surface. It adds approximately 760 KB of compressed generated PNG assets and a small browser bundle. Future state changes must continue to derive from existing authoritative projections rather than creating a second task-state machine or reopening a companion settings card.

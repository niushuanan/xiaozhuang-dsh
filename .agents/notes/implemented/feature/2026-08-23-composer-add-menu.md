# Agent Note: Native commands, plugins and skills menu

Status: implemented

English | [中文](2026-08-23-composer-add-menu.zh.md)

## Problem

The composer plus menu exposed images, Workspace references, and slash-provided Skills, but official Host commands lived in `ui-commands`' per-Session directory rather than the slash lexicon. A command therefore appeared after typing `/` but disappeared when the user clicked the discoverability-oriented plus button. The menu also remained an out-of-tree Profile package even though it had become a resident product surface.

## Decision

`ui-conversation` declares a plain `ComposerCommandCatalog` contract and adds `commandItems` to the existing `conversation.input.add` owner props. `ui-commands` implements that optional service from its existing per-Session `CommandDirectory`; successful refresh publishes a stable observable projection of official `{ name, description }` rows, while command, preset, and connection invalidations update the same source. No second RPC or catalog is created.

`InputBar` subscribes to the official directory and keeps slash-provided entries as `slashItems`. An official command wins any same-name collision. The shared `onInsertSlashItem` accepts either set and only inserts `/name ` at the current textarea selection; it never dispatches a command.

The repository-native `@deepseek-ai/dsh-composer-add-menu` package occupies the existing single add seat. Its work variant reuses native image intake and the live Workspace reference callback; its [Chat variant](2026-08-29-chat-input-and-workspace-return.md) offers image and text-file uploads plus the public-Web capability status. The **Commands, plugins and skills** group lists official commands first with the existing plugin icon, then Skills with the existing `IconSkillOutline16`. Selecting an item closes the menu and uses the owner insertion callback. Outside pointer, Escape, and disabled state retain the existing dismissal and focus behavior. Removing the occupant still reveals the original command-launcher fallback.

## Alternatives considered

**Copy the slash popup into the add plugin.** Rejected because a second command fetch, cache, and invalidation path would drift from what `/` actually exposes.

**Put a “Run command” row behind another click.** Rejected because the user explicitly needs command discovery inside the plus menu; an extra nested directory hides the same information again.

**Treat official commands as Skill lexicon entries.** Rejected because lexicon entries are references and Skills, while official command availability and descriptions are Session- and Agent-owned Host facts.

**Keep the Profile-only package.** Rejected because a core, bundle-resident interaction must build, typecheck, export, and adapt with the product source rather than depend on one machine's Profile.

## Consequences

Clicking plus now reveals the same official command names and descriptions available to the current Session, followed by plugins and Skills, while preserving image and Workspace actions. Picks remain editable text until the user sends them. Catalog invalidation is live, official collisions are deterministic, and the menu adds no business protocol or persisted state.

## Verification

Focused directory and conversation tests cover initial publication, live command/preset/reset invalidation, official-name precedence, selection-aware insertion, and the optional-service fallback. The native menu component test opens the visible plus menu, checks official commands before Skills under the exact product title, and confirms that choosing a command inserts through the callback without execution. The assembled Web smoke verifies the bundle-resident package is present with the conversation graph.

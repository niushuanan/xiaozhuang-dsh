# Agent Note: Chat migration as one installable capability

Status: implemented

English | [中文](2026-08-29-chat-migration-plugin.zh.md)

## Problem

Chat mode and DeepSeek history import form one user task: bring existing conversations into DSH and continue them without a Workspace or execution permissions. Publishing them as unrelated plugins lets an installation expose an import page without the destination Chat experience, or a Chat launcher without the migration path. Keeping import as an uncataloged baseline setting also hides its ownership and prevents selective export.

## Decision

The Xiaozhuang catalog exposes one **聊天迁移** capability. Its runtime state is the conjunction of the `ui-plain-chat` and `session-log-download` Loader rows, so the launcher and import Settings page enable or disable together. The existing packages continue to own their behavior: Chat mode creates ordinary Sessions with the internal `chat` preset, while `session-log-download` parses official DeepSeek JSON or ZIP exports and writes ordinary Session logs, titles, timestamps, reasoning, and projection indexes.

The export definition adds `composer-add-menu` as an install row and carries the modified connection, Session controller, Chat UI, sidebar, Workspace, conversation, preset, primitives, import, and `chat` preset package roots. This is an installation closure, not a new runtime package. The standalone `niushuanan/dsh-chat-migration` repository is a public MIT one-way copy generated from the committed main-repository definition. It contains code, manifests, hashes, instructions, and product screenshots, but never exported conversations, account data, credentials, settings, or local runtime state.

## Alternatives considered

**Publish history import as a second catalog row.** This exposes two switches and two install choices for one user task, and permits a destination with only half the required experience.

**Copy import code into the plain-chat package.** This duplicates the official Session export package's parser, authenticated Host route, persistence integration, and settings UI, creating two owners for the same durable operation.

**Keep import permanently enabled outside the catalog.** This leaves the feature invisible to plugin management and prevents users from exporting the capability they are already using.

## Consequences

Users install, switch, and export one item, then import into the same native Chat history they will continue using. Disabling the item also disables the Session export action because import and export share the `session-log-download` Host and Client row; the product accepts that coupling instead of splitting a mature package only for catalog presentation. The former `dsh-pure-chat` repository remains available as historical distribution, while current product links and future standalone synchronization target `dsh-chat-migration`.

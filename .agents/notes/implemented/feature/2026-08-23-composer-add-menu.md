# Agent Note: Reversible composer add menu

Status: implemented

English | [中文](2026-08-23-composer-add-menu.zh.md)

## Problem

The resident plus button opened the complete command directory even though a plus beside a message composer conventionally means adding a file or another common input. This made the first click surprising and buried the existing image intake path behind paste and drag gestures. Replacing the command directory outright would remove useful advanced actions, while a second permanent toolbar button would add chrome to every conversation.

## Decision

`ui-conversation` declares the single `conversation.input.add` slot at the first position in the composer toolbar. `InputBar` passes the native image-intake callback, supported media types, command-directory toggle, current command-menu state, lock state, and focus-restoration callback through plain owner props. With no occupant, the slot renders `ComposerCommandAction`, preserving the original plus-to-command behavior and the existing textarea DOM.

The Web profile's `composer-add-menu` plugin occupies that slot with a compact two-action menu. “Add file” invokes the browser file picker and sends selected image files through the same `intakeImages` validation and draft-attachment path used by paste and drag. “Run command” opens the existing command directory without copying its catalog or dispatch. Outside click and Escape close the compact menu. The Xiaozhuang plugin switch mounts and unmounts the occupant, so disabling it immediately reveals the native fallback.

## Alternatives considered

**Keep the plus button as a command shortcut.** Rejected because the icon and placement communicate adding content, not opening an advanced command directory.

**Replace commands with a file picker.** Rejected because command discovery remains valuable and the user asked to retain it.

**Add separate permanent file and command buttons.** Rejected because the common path needs one short first click, while two resident controls consume scarce composer space in narrow windows.

**Build another upload service.** Rejected because the native draft-image service already owns type and size limits, previews, removal, submission, and durable attachment admission.

## Consequences

The enabled profile makes file selection the first item under the plus button and keeps commands one item away. The current Host still accepts image attachments only, so the menu labels the picker as image-file selection instead of promising arbitrary document upload. The slot is a small public composition seam: future composer add menus can replace the presentation, but they must reuse the supplied callbacks rather than reach into conversation services or duplicate attachment state.

## Verification

Component tests retain the native command fallback and selection forwarding, while the profile contract tests pin the slot takeover, both actions, and dismissal behavior. The assembled Web path opens the compact menu, selects a local PNG through the real file chooser, observes the native pending-image rail, removes the test image, opens the unchanged command directory, disables the plugin through Settings to recover the native command launcher, and re-enables it without reloading the conversation.

## Related

The image draft and durable admission contract remains owned by [multimodal image input and durable attachments](2026-07-22-web-multimodal-image-input-and-durable-attachments.md), and its presentation remains owned by [attachment display alignment](2026-08-11-web-attachment-display-alignment.md). This note adds an entry point and does not supersede either decision.

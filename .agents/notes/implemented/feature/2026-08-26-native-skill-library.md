# Agent Note: Native Skill library and adaptive import

Status: implemented

English | [中文](2026-08-26-native-skill-library.zh.md)

## Problem

Skills were visible only while invoking them. Users could not browse the abilities already available from personal, project, runtime, custom, and bundled providers, inspect a multi-file Skill without opening another tool, or turn an arbitrary file, folder, archive, or repository into a safely installed personal Skill.

## Decision

The Web bundle ships `@deepseek-ai/dsh-client-ui-skill-manager` as one native Settings section titled **Skill**. It resolves the active Session's cwd, live Agent, preset, and scoped Skill registry—the same source used by the composer—rather than creating another catalog or reading only the global fallback. Each winning Skill row carries its source and writeability, and every row reuses the product's existing `IconSkillOutline16`. Opening a row stays on the same page: the left pane becomes the Skill/file directory and the right pane renders its human explanation plus the selected Markdown, text, code, image, or binary metadata.

The same page accepts files, a browser-selected folder, a ZIP archive, or a plain GitHub repository URL. The Host stages the source as untrusted data, rejects unsafe paths and symbolic links, excludes common secret files from model input, and bounds file count and bytes. GitHub sources use a shallow single-branch clone. ZIP entries are validated before extraction.

Normalization always calls `deepseek-official/deepseek-v4-flash-vision-exp` with no tools and outside the user's Session. The model may only propose one validated `SKILL.md` and mappings to already staged resources. A same-name conflict causes one additional narrow request containing only the existing Skill's direct definition. The Host validates the proposal and atomically swaps a candidate into `$DSH_HOME/skills`; a failed replacement restores the prior personal Skill. Project, runtime, custom, and bundled providers are never written.

## Alternatives considered

**Build a separate Skill database.** Rejected because provider precedence, hot refresh, and invocation already belong to `ctx.skills`; a second store would inevitably disagree with the abilities the Agent can actually invoke.

**Open Skill files in the operating-system editor.** Rejected because the user's task is discovery and understanding. Inline inspection keeps the directory, explanation, and file content in one predictable place.

**Copy uploads directly into the personal directory.** Rejected because arbitrary material may not be a valid Skill, may contain path traversal or secrets, and may collide with a working personal Skill. Staging, bounded normalization, validation, and atomic replacement keep a failed import recoverable.

**Use the current conversation model.** Rejected because import is a product-owned background AI function. A fixed low-cost route makes its behavior independent from whichever model the user selected for work or chat.

## Consequences

Users can now see what Skills they have, where each visible Skill comes from, and every owned file without leaving Settings. External material can become a personal Skill through one consistent import path while existing sources remain authoritative and read-only. The first version shows only the winning provider for duplicate names and completes imports synchronously; it does not add a second Skill protocol, background job history, or execution permission to imported content.

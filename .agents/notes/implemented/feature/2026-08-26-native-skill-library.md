# Agent Note: Native Skill library and adaptive import

Status: implemented

English | [中文](2026-08-26-native-skill-library.zh.md)

## Problem

Skills were visible only while invoking them. Users could not browse the abilities already available from personal, project, runtime, custom, and bundled providers, inspect a multi-file Skill without opening another tool, or turn an arbitrary file, folder, archive, or repository into a safely installed personal Skill.

## Decision

The Web bundle ships `@deepseek-ai/dsh-client-ui-skill-manager` as one native Settings section titled **Skill Management**. It resolves the active Session's cwd, live Agent, preset, and scoped Skill registry—the same source used by the composer—rather than creating another catalog or reading only the global fallback. Each winning Skill row carries its writeability badge, and every row reuses the product's existing `IconSkillOutline16`. The first view is a width-capped single-column catalog whose rows also show an AI-judged frontmatter category tag and a clamped introduction ([Skill categories ride a frontmatter field, never client inference](2026-08-27-skill-category-tag.md)). Opening a row replaces the catalog with a focused reader that keeps a compact, expandable human explanation above a left file tree and readable selected-file pane; one back action restores the catalog. The visual Markdown preview omits leading YAML frontmatter without changing the source.

One black **Import Skill** menu presents files, a browser-selected folder, and a plain GitHub repository URL as peer sources. File and folder choices open their browser picker immediately; choosing GitHub reveals an inline URL field. ZIP archives travel through the file path. The Host stages the source as untrusted data, rejects unsafe paths and symbolic links, excludes common secret files from model input, and bounds file count and bytes. GitHub sources use a shallow single-branch clone. ZIP entries are validated before extraction.

Normalization always calls `deepseek-official/deepseek-v4-flash-vision-exp` with no tools and outside the user's Session. The model may only propose one validated `SKILL.md` and mappings to already staged resources. A same-name conflict causes one additional narrow request containing only the existing Skill's direct definition. The Host validates the proposal and atomically swaps a candidate into `$DSH_HOME/skills`; a failed replacement restores the prior personal Skill. Project, runtime, custom, and bundled providers are never written.

## Verification

`apps/web/tests/skill-manager.e2e.ts` boots the shipped Web composition with an isolated personal Skill. Its keyless snapshots pin the catalog, conditional GitHub form, focused detail reader, frontmatter-free visual preview, and a content pane wider than 300 pixels and wider than the file tree.

## Alternatives considered

**Build a separate Skill database.** Rejected because provider precedence, hot refresh, and invocation already belong to `ctx.skills`; a second store would inevitably disagree with the abilities the Agent can actually invoke.

**Open Skill files in the operating-system editor.** Rejected because the user's task is discovery and understanding. Inline inspection keeps the directory, explanation, and file content in one predictable place.

**Keep the Skill catalog, file tree, and content open as three permanent columns.** Rejected because the Settings content column cannot give all three a readable width. A catalog-to-reader transition preserves one page and one back action while reserving the detail view for the file tree and content.

**Copy uploads directly into the personal directory.** Rejected because arbitrary material may not be a valid Skill, may contain path traversal or secrets, and may collide with a working personal Skill. Staging, bounded normalization, validation, and atomic replacement keep a failed import recoverable.

**Use the current conversation model.** Rejected because import is a product-owned background AI function. A fixed low-cost route makes its behavior independent from whichever model the user selected for work or chat.

## Consequences

Users can now scan what Skills they have, then read one Skill without a third column crushing its content. External material enters through one consistent import control while existing sources remain authoritative and read-only. Moving from the catalog into a detail reader costs one explicit back action. The first version shows only the winning provider for duplicate names and completes imports synchronously; it does not add a second Skill protocol, background job history, or execution permission to imported content.

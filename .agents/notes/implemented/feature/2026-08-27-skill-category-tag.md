# Agent Note: Skill categories ride a frontmatter field, never client inference

Status: implemented

English | [中文](2026-08-27-skill-category-tag.zh.md)

## Problem

The Skill Management catalog put two skills on one row, labeled almost every row with the same source word (个人), and showed nothing about what each skill does. With roughly thirty installed skills, the list offered almost no discriminating information per row. The owner also set a direction rule: any grouping tag must come from data — produced by AI judgment when a skill is created, and backfilled onto stock skills by AI judgment — never from a hardcoded name-prefix or keyword table inside the UI.

## Decision

An optional frontmatter field, `category`, is now a first-class `SkillSummary` member, parallel to `whenToUse`:

- `dsh-skill-filesystem` parses optional `category:` like `whenToUse` and carries it on candidates and definitions.
- The registry type-checks the value when present (`validateCandidate`, `validateDefinition`) and projects it through `runtimeCandidate()` and `toSummary()`, so local files, custom providers, and `ctx.skills.register()` calls can all supply one.
- The Skill Management page renders a width-capped (820 px) single-column catalog. Each row shows the icon, the name, the category tag next to the title, a two-line-clamped introduction that merges `description` with optional `whenToUse`, and the writability badge on the right end. Rows without a category omit the tag. Rows keep the accessible button semantics; the visible source-group word was removed because the badge already encodes permission and the focused reader still shows the full source group.
- Import normalization requires the field: the fixed normalization prompt demands a short Chinese category (两到四个汉字) in the JSON response, and installation rejects a proposal whose `SKILL.md` frontmatter category differs. Every future imported skill therefore arrives grouped.
- Stock skills were backfilled once by direct AI judgment of each file's description, writing plain `category:` lines: the 28 personal skills under `~/.agents/skills`, `tokscale-token-report` under `~/.dsh/skills`, and the repository's 11 `.agents/skills` entries, using five values {飞书, 钉钉, 工作流, 开发, 数据}. No inference code exists anywhere in the product.

## Alternatives considered

- Inferring categories in client code from name prefixes and description keywords — rejected: the mapping hardens opinions that drift from real content, and the owner explicitly ruled out hardcoding.
- Keeping the source-group word beside the new tag — rejected: 可写/只读 already carries permission, the reader view retains the exact source group, and repeating 个人 on 28 of 30 rows added noise rather than information.
- Reusing the provider-opaque `metadata` passthrough instead of a typed field — rejected: the invocation-neutral summary seam stays explicit and validated only as a named member.

## Consequences

Every catalog row now shows its own differentiating facts — what it does, where it belongs, whether it is editable — without widening the panel or invoking any model at render time. Import time pays a few extra output tokens for the mandatory field.

Runtime and bundled skills have no SKILL.md file to edit, so they remain untagged until their registrations carry `category`; `image-vision` stays tagless until its profile bundle can be rebuilt, which must not interrupt the running instance. Reinstalling an external suite (for example the lark-* collection) overwrites backfilled frontmatter and would need the judgment pass again.

## Related

[Native Skill library and adaptive import](2026-08-26-native-skill-library.md) owns the Settings page itself; this note owns only how each row acquires its grouping tag and introduction.

## Testing

The registry suites add candidate/definition type-error cases and summary-projection assertions; the filesystem suite parses a `category:` line; the import host spec covers the missing-field rejection and the frontmatter mismatch rejection; the component spec asserts the tag, merged introduction, badge, and tagless rows; the web e2e fixture gained a category and its three goldens were regenerated under `DSH_SNAPSHOT=refresh`.

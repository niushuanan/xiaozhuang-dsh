# Agent Note: History discovery and product branding after upgrade

Status: implemented

English | [中文](2026-09-05-history-discovery-and-product-brand.zh.md)

## Problem

After the adjacent Session-format upgrade, old conversations appeared missing even though their records were still listed. Cold navigation reused predecessor titles and presets but omitted the last-prompt metadata, moving active conversations back to their creation dates. The workspace browser also lost its previously shipped progressive expansion. The shell showed the upstream local-build identity instead of the community product name.

## Decision

The Session list explicitly requests the version-compatible `sessionListMetadata` predecessor row alongside `title` and `agentPreset`. Existing lifecycle and row-schema checks still apply. These rows are navigation hints, not replay seeds; listing does not open cold history bodies.

Cold fork navigation cannot know the inherited replay cut from a header alone. Its display-only cache path therefore checks the Session identity, creation time, workspace, format direction, and any recorded seed flag without pretending to know that cut. It returns only the requested schema-compatible rows at unknown sequence `-1`. Strict checkpoint and predecessor APIs still require their complete replay identity. This preserves fork names for title search without trusting their cached replay state.

The workspace browser restores the existing per-group 5 → 10 → 20 visible window. Blank drafts do not consume the window, drag anchors use that same window, and closing a group resets it. This is local presentation state, not a new history limit.

The v0 migration also recognizes the recorded pre-correlation `compact/*` vocabulary and reconstructs missing compaction and retry identities from their existing ordered transactions. Current-format validation still checks payloads, references, and relationships. The standard read handle publishes a new generation beside the untouched original; it does not remove failed events or replace recorded answers.

The existing `plugin-manager` product folder owns the Xiaozhuang DSH sidebar name and document title. The sidebar uses its existing branding slot; layout exposes a neutral document-title slot with the upstream title effect as fallback. Removing the product plugin restores the upstream identity without adding a product dependency to core.

Settings navigation had also fallen back to generic gears because the upgraded shell recognized only upstream section ids. Each of the nine affected native plugins now registers its original glyph in a neutral `settings.section.icon` slot, keyed by its section id and disposed with its own lifecycle. The shell retains its default glyph for sections without a contribution. Real Settings clicks verify every restored icon and page; the Loader composition regression also verifies disposal without changing other entries.

## Alternatives considered

**Reimport or unarchive everything.** Neither repairs the omitted metadata. Reimport can duplicate conversations, while unarchiving changes intentional user organization.

**Open every history body to populate the sidebar.** This adds unnecessary startup work. Version-compatible cached navigation metadata already carries the required time.

**Hard-code the product name in core.** This violates directory-level removability and makes the upstream shell depend on a specific distribution.

## Consequences

Recent activity remains discoverable without rewriting original conversations or changing their content. Navigation hints can remain stale until a session is opened, as before; they do not certify replay correctness. Real history reads and direct message-content audits separately verify readability and preservation. Brand and expansion tests exercise the assembled UI, including plugin disposal and group reset.

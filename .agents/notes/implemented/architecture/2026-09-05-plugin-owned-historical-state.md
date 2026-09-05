# Agent Note: Plugins declare bounded historical state compatibility

Status: implemented

English | [中文](2026-09-05-plugin-owned-historical-state.zh.md)

## Problem

Released external plugins wrote informational state without an `ignorable` envelope. Refusing every such record prevents users from reopening their conversations after a core upgrade. Copying arbitrary unknown events can retain invalid sequence references, while dropping them loses plugin state.

## Decision

The existing [Session format library](../../../../packages/session/session-format/README.md) accepts an effect-scoped declaration for one external event type, a bounded version interval, and a complete payload validator. The owner promises that the state is independent of Session sequence numbers and core lifecycle or model-visible semantics. Historical edges consult this declaration only for events absent from their first-party inventory; envelopes with surface operations or source-event references remain unsupported. Accepted state retains its payload, timestamp, and relative order and gains `ignorable: true` in the successor. Core packages contain no product-plugin names.

Teamwork owns a strict boolean `active` validator inside its removable plugin folder. Its declaration covers v0 through v2, including the v1-to-v2 Assistant-chunk compaction. The plugin must be present for the first body read of unmarked historical Teamwork state. Once the normal JSONL provider publishes the current generation, equal-version reading retains that state even when Teamwork is removed.

The adjacent edges also recognize verified first-party historical metadata. Permission origin remains metadata and never changes the recorded permission preset, sandbox mode, or approval policy. A supported legacy subagent descriptor retains its actual provider, model, label, and mode while its version is normalized; absent optional fields do not acquire guessed values.

Publication follows [immutable adjacent migration](2026-08-31-released-session-format-migrations.md): the old path, bytes, and inode remain unchanged, and only a new version-named generation is added. Source stability uses file identity and direct byte equality, not hash comparison. An unsupported record receives a diagnostic and no successor.

This is a bounded exception to [alpha unknown-event refusal](2026-08-31-alpha-historical-unknown-event-refusal.md), not a replacement for its refusal of undeclared or semantically unverified records. The static first-party migration chain remains complete and independent of plugin composition.

## Alternatives considered

- **Teach core code about Teamwork** — makes core depend on a removable product folder and prevents independent plugin ownership.
- **Trust every unknown event or every `ignorable` marker during migration** — cannot establish that opaque payloads remain valid after sequence positions change.
- **Delete unknown state or rewrite the original file** — loses user data or removes the original evidence needed to recover it.
- **Keep unconditional refusal** — leaves known, sequence-independent plugin state blocking otherwise valid historical conversations.

## Consequences

First conversion of an unmarked plugin event depends on its installed owner. Removing that owner before conversion does not authorize the core to invent its semantics. Converting a validated conversation once removes this dependency for current-format reads; it does not promise downgrade support or fallback to an older generation.

Focused tests exercise both historical entry versions, preserved state and message order, current-generation reading after disposal, and continued refusal of unknown required events and unsupported state. Real-artifact checks exercise decode, adjacent migration, current encoding, and reopening without editing the source generation. The ordinary JSONL publication tests retain direct source-byte and identity checks.

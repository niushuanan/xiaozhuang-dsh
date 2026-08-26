# Agent Note: Per-model visibility — the `hidden` catalog-face flag

Status: implemented

English | [中文](2026-08-26-model-visibility-hidden-flag.zh.md)

## Problem

The more models a deployment connects, the longer the selector and the settings catalog grow, and deleting one entry from `settings.yaml` is all-or-nothing: removal drops the capacity metadata, and restoring it means re-checking provider docs. What a user needs is "stop showing this", not "delete this" — and that semantic exists in neither LLM adapter family.

## Decision

Both adapters' model entries gain the same optional boolean, `hidden` (`llm-deepseek.catalogModel`, and `modelFields` for `llm-pi-ai`), defined as **acting on the advertisement face only**:

- The filter point converges on each adapter's own `listModels()` — every directory consumer (apiproxy's `session.models`/`llm.models`, tool-cordis's api-catalog) reads through `ctx.llm.listModels()`, so filtering there reaches every surface in one move.
- Exact routing is untouched: pi-ai's materialized list keeps every model (`getModel` ignores `hiddenIds`) and deepseek's `resolveModel`/`resolveModelInfo` answer as before. This is precisely the advisory contract [[2026-07-15-llm-model-catalog-and-acp-selection]] settled — hiding a model that is currently selected cannot invalidate the session.

Data flow: on the pi-ai side `resolveRouteModels` collects `hiddenIds` into `RouteCatalog`, carried on the profile snapshot as `ResolvedPiAiProviderProfile.hiddenModels`; on the deepseek side the catalog entry carries its own flag. Absent means shown, and un-hiding deletes the key rather than storing `hidden: false`.

The client (`ui-settings-models`) grows an eye toggle on both editors' rows (new shared component `ModelVisibilityToggle`): pressed state equals hidden state, a hidden row dims for scannability, and revealing clears the field instead of writing `false`, matching how every other optional field leaves the profile when cleared.

## Consequences

- "Hidden but configured" becomes a first-class ability: slimming the selector no longer trades against the risk of retyping an entry, and a logged session whose default selection names a hidden model keeps routing.
- Untouched by design: the selector, agent-default-model, subagent collaborators, and every other consumer change nothing — the directory they read already omits hidden entries; deep links and a zcode collaborator's explicit model id keep working.
- One rejected neighbor: filtering at materialization (dropping entries from `piProvider.models`) would upgrade hiding into disabling and invalidate an existing selection. Pushing the filter into each front-end consumer would restate the same judgment per UI.
- Known pre-existing failure (unrelated here, left for the next sweep): the `styles.client.spec.ts` dropdown-chevron gate is red on a clean tree (`ModelCapabilitySelect.tsx` ships a `<select>` without the `selectInput` class).

## Alternatives considered

- **Carry a hidden marker to each consumer through RPC payloads** — rejected: wider protocol, snapshot churn across SDKs, same outcome as listing fewer items at the source.
- **Front-end-only filtering (CSS or selector-side)** — rejected: API-facing catalogs (ACP, the api-catalog tool) would still list the model, so "hidden" would be false advertising.

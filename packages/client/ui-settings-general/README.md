# @deepseek-ai/dsh-client-ui-settings-general

English | [中文](README.zh.md)

Settings shell, ownerless copy, durable product-onboarding namespace, and the product System Prompt editor. It occupies `sidebar.settings` with the trigger chrome and modal settings panel, projects the `settings.section` ledger into the navigation and the `settings.onboarding` ledger into one mounted step at a time, and registers everything on the Settings pages that belongs to no single feature — the trigger/header/close chrome content, the local configuration-file action, the General section and its `settings.general.item` slot, the System Prompt editor at the bottom of General Settings, and the `settings` dictionaries. The slot types it renders into belong to ui-settings, the settings domain base; only the shell's own contract types live here, because they reference ui-sidebar's slot type and the base layer must depend on no `ui-*` package. Feature-owned rows (Permission, Language, Appearance), sections (Models), and conditional onboarding steps stay with their feature packages.

The shell ships no onboarding copy of its own — all text arrives from registrants. Nav labels may be locale-following thunks, so the nav projection resolves them through `resolveSlotLabel` and re-renders on the section ledger bump or the locale revision (an optional `ctx.get('locale')` read; no hard locale dependency). The onboarding ledger projects in ascending order and mounts exactly one step at a time. Visible steps own their dialog chrome and app-root `inert` lifecycle; a mounted step still resolving private facts renders null, so nothing paints or blocks while it decides. The active registrant receives its id, `complete()`, and an `openSection(id)` callback; completing or skipping transfers ownership to the next entry. Registrants own durable completion, capability readiness, copy, mutations, and their visible wrapper, so independently registered flows cannot stack and the shell does not become a second configuration fact source.

A loopback browser loads the provider's `hasDocument` capability through `settings.describe` and renders **Open configuration file** only when the Host confirms that a provider-owned local document can be prepared. The action sends the pathless, loopback-only `settings.openDocument` request; the Host resolves the provider path again, materializes an absent document, and hands it to a native text editor (`open -t` on macOS, bypassing a browser file association; the desktop file association on Linux and Windows; Windows association after `wslpath -w` translation on WSL). Open failures keep the action available and render a localized error. Reopening the dialog or reconnecting refreshes availability after a transient read failure or Host topology change. Remote browsers never register the action and never issue the privileged settings read.

The Host half registers `ui-onboarding` in the user-settings seam. The welcome step contributed by `ui-settings-models` reads and writes its `welcomeNoticeVersion` through the existing public settings boundary; the shell itself remains policy-free.

The Host half also exposes one loopback-only, pathless editor endpoint for `$DSH_HOME/SYSTEM.md`. Before the file exists, the endpoint returns the Web product's current base prompt so the editor exposes existing behavior rather than an empty additive override. Saves are revision-checked and atomically replace the fixed file. The editor refreshes only while its draft is clean, prevents external edits from being overwritten, supports Cmd/Ctrl+S, and applies from each conversation's next model step without restarting DSH.

Known section ids keep their product glyphs in the navigation. In particular, the Computer Use section reuses the shared monochrome computer glyph from ui-primitives and compensates for the source image's clear padding without changing the aligned 16px slot, so it no longer reads smaller than adjacent navigation icons or falls back to the generic settings gear.

Pressing and holding a section row for one second starts direct navigation reordering. While the pointer moves, one high-contrast insertion line marks the drop position; moving above or below the short list clamps the target to the first or final real row instead of treating the panel's empty space as extra positions. Releasing stores the section-id order in the shell's root-scoped viewing store, so reopening or reloading keeps it. Sections registered later append in their normal plugin order, and removed section ids disappear without blocking the remaining order. Every row fills the same navigation width regardless of label length. A normal click continues to switch sections immediately and never enters a separate edit mode.

## Model Experience

The editor controls the product-wide system prompt read by `dsh-agent-instructions`. `SYSTEM.md` replaces the deployment persona and is restored after DSH assembly listeners, immediately before the protected `AGENTS.md` owner section.

#### KV Cache effect

The saved prompt is repeated on each model request. A stable file keeps this portion stable; edits invalidate reuse from the changed prompt tokens.

## Known Limitations and Deferred Work

- The current-prompt fallback follows the shipped Web persona. A custom deployment with a different unsaved persona must also customize this product copy before distribution.

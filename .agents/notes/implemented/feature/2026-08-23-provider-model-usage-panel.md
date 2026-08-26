# Agent Note: Provider model-usage panel

Status: implemented

English | [中文](2026-08-23-provider-model-usage-panel.zh.md)

## Problem

The session header exposed provider capacity through a large row table with mixed content shapes, repeated separators, a redundant back button, inconsistent logo geometry, and no membership context. It also mislabeled the signed-in ChatGPT subscription as CODEX and merged a model-specific five-hour bucket into the account view.

## Decision

`@deepseek-ai/dsh-client-ui-provider-quota` presents DeepSeek, KIMI, GLM, and GPT in one 520px Chinese two-by-two card panel. Provider brands and official plan names remain Latin. Every card uses a real brand image with the same 8px frame and 6px image radius; KIMI uses its official filled app icon, GLM uses Z.ai's official Z mark, and GPT uses the OpenAI mark. DeepSeek shows one account balance without exposing cash/bonus decomposition. The header has one refresh icon and no internal back control; the existing session-header trigger closes the panel.

The session-header trigger uses a dedicated generated usage-intensity asset: three cobalt capacity bars crossed by one orbital activity curve. It replaces the yellow status dot, whose warning semantics made a normal product entrance look unhealthy. Provider failures remain explicit inside the panel and no longer own the trigger's identity. The optimized 64px transparent PNG is embedded in the client bundle for offline plugin operation, while its master and runtime-sized source stay under the plugin's `assets/` directory.

Quota lines are semantic rather than decorative. Each five-hour or weekly metric owns a visible gray capacity track, a blue consumed segment only when usage is above zero, a direct percentage, and an absolute Beijing-time reset timestamp. A thin divider separates five-hour and weekly facts inside the same card, while a subtle card outline separates providers. When a zero-usage provider omits `nextResetTime`, the panel says no reset is currently available instead of guessing.

Host and client startup perform no provider work. The first panel open requests the snapshot, and subsequent opens reuse the five-minute Host cache. The refresh icon explicitly bypasses cache, while an open panel refreshes silently every five minutes. Codex app-server stdin errors settle only the GPT provider request; they cannot escape as an unhandled stream event and terminate the Web Host. The header trigger, outside click, and Escape close the panel.

DeepSeek treats the key selected in `~/.claude/multi-gateway/config.json` as the account of record; environment and `~/.dsh/.env` keys are migration fallbacks only when that selected key is absent. KIMI derives `used = limit - remaining` when the official response omits `used` after a reset and prefers the official account name `Allegro` over the internal `LEVEL_ADVANCED` enum. GLM reports `Pro`. GPT performs the official initialize, `account/read`, and `account/rateLimits/read` app-server sequence, reports `Pro · 20X`, and exposes only the main account's weekly window. No email or authentication material enters the snapshot.

The product name remains `DeepSeek Harness` in the HTML, document-title, and sidebar fallbacks, so an ordinary local build can no longer rename the visible product to `DSH Local Build`; the official brand plugin remains free to replace those fallbacks.

## Alternatives considered

**Read Codex authentication files directly.** Rejected because those files are credentials, not the owned quota interface. The local app-server already represents the signed-in desktop account and returns rate-limit facts without copying tokens into the plugin.

**Merge a `codex_*` model bucket into GPT account limits.** Rejected because the user wants the subscription account view, whose main bucket currently exposes only weekly usage. A model-specific five-hour bucket is a different product fact and would misrepresent the account limit.

**Warm every provider during Host or client startup.** Rejected because vendor networking and the Codex child process compete with session loading, model switching, and the first message even when the user never opens Model Usage. Demand loading preserves the feature and keeps subsequent opens cache-first.

**Reuse the warning-status dot as the usage icon.** Rejected because yellow communicates caution rather than model consumption and contains no recognizable usage metaphor. A product-specific raster asset keeps the compact entry distinct without extending the icon library or faking artwork in CSS.

## Consequences

The current machine can open a demand-loaded four-provider view, explicitly refresh it, and leave it open for periodic updates. The first open waits for provider results; startup stays independent of vendor latency, and later opens reuse the cache. The header entrance reads as model usage rather than an alert. The visible DeepSeek value follows the user-selected account. KIMI and GLM expose five-hour plus weekly usage; GPT exposes weekly usage only. Codex monitoring still requires the local binary and signed-in ChatGPT account. Vendor and public asset endpoints remain external dependencies; one provider failure stays isolated to its card.

## Verification

Focused component tests cover the Chinese cache-first panel, manual refresh, balance-only DeepSeek card, membership labels, semantic progress bars, absolute reset timestamps, GPT weekly-only behavior, trigger close, and the embedded PNG trigger asset. Pure mapping tests cover KIMI's remaining-value fallback and GPT's weekly-window filter. The package bundle and full official build pass. The real `127.0.0.1:3080` route returns four live provider reports; the in-app browser measures the panel at 520×330 (50.8% less area than the original 760×459 panel), verifies that both 0% bars are gray with no blue child, all reset strings render without truncation, refresh/toggle behavior works, cache-first opening takes 289ms, and a fresh tab has zero console errors. The revised real page renders the generated trigger at 16×16 from its 64×64 embedded source with zero console errors. Design QA compares the pre-change real capture and revised rendered panel together.

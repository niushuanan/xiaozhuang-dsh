# `@deepseek-ai/dsh-client-ui-provider-quota`

English | [中文](README.zh.md)

Session-header model-usage panel. The browser half contributes one header action into `conversation.session.header.actions` and presents DeepSeek, KIMI, GLM, and GPT in one compact two-by-two Chinese panel. Startup performs no provider request: the first panel open loads a snapshot, while Host-side caching, a manual refresh control, and an open-state five-minute poll keep it current. The node half serves the aggregated snapshot at `GET /plugins/ui-provider-quota/api/usage` (same-origin, so the browser needs no vendor keys and hits no CORS wall), resolving keys read-only from the environment, `~/.dsh/.env`, `~/.claude/multi-gateway/config.json`, and `~/.zcode/v2/config.json`. GPT reads the account already signed in through the installed Codex app-server. A broken or prematurely closed app-server pipe stays contained as that provider's error instead of terminating the Web Host, and the snapshot returns neither the email address nor any credential. The selected DeepSeek key in `~/.claude/multi-gateway/config.json` takes precedence over keys for other accounts. Snapshots cache for five minutes per host process; `?force=1` bypasses the cache.

## Channel shapes

- **DeepSeek** — official balance API, rendered as one account-balance value; internal topped-up/granted fields are not exposed in the panel.
- **Kimi** — `sk-kimi-*` keys query the Kimi Code `/usages` endpoint (weekly plus 5-hour rolling windows, booster-wallet facts); plain Moonshot open-platform keys query the money balance endpoint instead.
- **Z.ai / GLM** — the console monitor quota endpoint; quota only, never money.
- **GPT** — the installed Codex app-server's signed-in account snapshot. The panel renders only the main account's 10,080-minute weekly subscription window and deliberately does not merge model-specific five-hour buckets.

The plan labels also come from the signed-in accounts: KIMI exposes its official `Allegro` name, GLM exposes `Pro`, and GPT exposes `Pro`; the UI adds the user's `20X` entitlement label to GPT.

Each quota window renders as an explicitly labelled progress meter: the full capacity is a visible gray track, and only the consumed share is blue. A zero value therefore stays entirely gray. The exact reset timestamp is shown below each meter in Beijing time. When a provider returns zero usage without a reset timestamp, the panel says that no reset is currently scheduled instead of inventing a time.

The four providers share one panel plane rather than separate rounded cards. Inset horizontal and vertical gray rules divide the 2×2 regions, while the short internal rule in KIMI and GLM continues to separate the five-hour and weekly windows.

Brand images use KIMI's official square app icon, the native icon extracted from the installed Z Code desktop app, and pinned MIT-licensed Lobe Icons assets for DeepSeek and OpenAI. All four brands use one 34×34px clipping frame with an 8px radius. Brand-specific dark or light fills preserve identity, while the shared frame owns the final silhouette.

The header action uses the project's native monochrome data icon. Its vector geometry and current-color rendering match the adjacent agent-mode and chevron controls. It is rendered proportionally at 14px so its outline stays lighter than the label; provider warnings remain inside the panel where their scope is clear.

## Model Experience

None, as the node half registers no prompt, tool, message, or provider request and the browser half is display-only.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Kimi and Z.ai endpoints are undocumented** — both were reverse-engineered from official clients and verified live, but either vendor can change them without notice; the panel reports per-provider errors instead of failing.
- **Quota ≠ money for Kimi and Z.ai** — only DeepSeek (and Moonshot-platform keys) expose real balances; the Kimi booster wallet reports usage facts only when enabled on the account.
- **Key discovery is per-machine** — resolution walks a fixed chain of local config files; a key stored nowhere in that chain shows as "no key found".
- **GPT is desktop-account scoped** — GPT usage requires an installed `codex` binary with a signed-in ChatGPT account. API-key-only Codex configurations do not expose ChatGPT subscription rate limits.

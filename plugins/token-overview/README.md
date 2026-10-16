# Token Overview

The native Token Overview plugin adds a Settings entry and a local report at `/plugins/token-overview/report/`. The canonical `tokscale-token-report` Skill owns collection, fork/subagent deduplication, completed-day recovery, token definitions and API-equivalent prices. Deleting this plugin directory removes its functionality without changing the official core.

## Daily forecasting

Today's forecast updates every three minutes; the complete historical report updates every ten minutes. The browser polls cached snapshots every thirty seconds and preserves historical filters. Forecast dates and hourly boundaries use `Asia/Shanghai`. Historical date filters do not change the live day; the forecast reuses the report’s platform selector.

The forecast stays a regular report section after growth momentum. Its single chart switches between hourly bars and cumulative usage: observed usage is solid, future usage dashed, with yesterday and the previous seven days' mean for comparison. Missing comparison days stay unavailable and reduced sample coverage is disclosed. Daily total, observed amount and remainder remain the only summary metrics; explanations and errors stay collapsed.

The nonlinear engine directly predicts future hours using the maintained mljs random forest, an observed-trajectory kernel and a seasonal kernel. Its inputs include hourly lags, activity/quiet duration, weekday, prior daily levels, calls and cache/output proportions. Whole-day forward errors select the blend; the old linear candidate and custom regression stumps are removed. A persistent worker trains off the Host event loop and reuses fits while past input content stays unchanged. See [methodology and GitHub research](FORECASTING.md) for the selected algorithms and limits.

`hourly-history.json` lives under `$DSH_HOME/token-overview` independently of replaceable report slots. Each hourly observation retains its token, call, cost and cache components together. Later source-log deletion cannot reduce retained observations. A past client day participates in hourly training only after a closed-day scan reconciles with its protected daily total; explicitly estimated dates are excluded. Recent scans include yesterday to close the midnight boundary. Missing hours are never distributed across historical days.

Prediction ranges use prior forward residuals when enough positive days exist, otherwise a provisional wider range. Eight positive calibration days and eight positive complete hourly days are minimum support thresholds, not accuracy guarantees. The report distinguishes historical replay from predictions genuinely issued and later settled in `forecast-accuracy.json`. It reports total error and days within the 10% target; unseen new tasks prevent a per-day guarantee.

## Runtime and recovery

`refreshIntervalMs` defaults to 600000 and `forecastIntervalMs` to 180000 in the plugin config. `artifactRoot`, `reportScript` and `python` retain their existing overrides. A single serialized scheduler prevents full and incremental collectors from overlapping. Disposal awaits its prediction worker and collectors. Successful generations replace cached snapshots atomically; failed scans retain the preceding forecast and report. A corrupt hourly ledger fails visibly without discarding it. Forecast and report endpoints are read-only and do not trigger collection.

The forecast does not send messages, modify original session logs, change model settings, or call an inference provider.

## Verification

Install workspace dependencies, build with `node plugins/token-overview/scripts/build.mjs`, then run `node --test plugins/token-overview/test/*.test.mjs` from the repository root. Reproduce aggregate intraday backtests with `node plugins/token-overview/scripts/backtest.mjs /path/to/report-slot`. The script reads existing snapshots and prints aggregate metrics without modifying usage history.

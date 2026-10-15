# Token Overview

The native Token Overview plugin adds a Settings entry and a local report at `/plugins/token-overview/report/`. The canonical `tokscale-token-report` Skill owns collection, fork/subagent deduplication, completed-day recovery, token definitions and API-equivalent prices. Deleting this plugin directory removes its functionality without changing the official core.

## Daily forecasting

Today's forecast updates every three minutes; the complete historical report updates every ten minutes. The browser polls cached snapshots every thirty seconds and preserves historical filters. Forecast dates and hourly boundaries use `Asia/Shanghai`. Historical date filters do not change the live day; the forecast reuses the report’s platform selector.

The forecast is a regular report section after growth momentum. It shows the expected daily total, observed usage, remaining usage and a compact hourly chart. Prediction ranges and freshness sit below the chart; historical errors and sample limitations are collapsed under “预测说明与历史误差”. Settings keeps its existing usage overview and links to the detailed report.

A causal ensemble combines robust recent and weekday priors, a linear baseline, intraday profile, recent intensity, nearest historical days and shrunk gradient-boosted regression stumps. Hourly conditional candidates require complete records; the boosted candidate requires at least 28 complete positive-usage days and observed validation errors before receiving production weight. Inverse rolling absolute-error weights determine the mixture. Predicting the remainder keeps the final total at or above observed usage; platform totals and hourly remainders reconcile.

`hourly-history.json` lives under `$DSH_HOME/token-overview` independently of replaceable report slots. Each hourly observation retains its token, call, cost and cache components together. Later source-log deletion cannot reduce retained observations. A past client day participates in hourly training only after a closed-day scan reconciles with its protected daily total; explicitly estimated dates are excluded. Recent scans include yesterday to close the midnight boundary. Missing hours are never distributed across historical days.

Prediction ranges use prior rolling-origin residuals when enough positive days exist, otherwise a provisional wider range. Eight positive calibration days are the minimum for a non-provisional range; this is a support threshold, not an accuracy guarantee. The all-platform view cannot become calibrated before its material platforms. No forecast can anticipate an unobserved future task. The report’s collapsed explanation exposes errors for 08:00, 12:00, 16:00 and 20:00 for the selected platform.

## Runtime and recovery

`refreshIntervalMs` defaults to 600000 and `forecastIntervalMs` to 180000 in the plugin config. `artifactRoot`, `reportScript` and `python` retain their existing overrides. A single serialized scheduler prevents full and incremental collectors from overlapping. Successful generations replace cached snapshots atomically; failed scans retain the preceding forecast and report. A corrupt hourly ledger fails visibly without discarding it. Forecast and report endpoints are read-only and do not trigger collection.

The forecast does not send messages, modify original session logs, change model settings, or call an inference provider.

## Verification

Build with `node plugins/token-overview/scripts/build.mjs`, then run `node --test plugins/token-overview/test/*.test.mjs` from the repository root. Reproduce aggregate intraday backtests with `node plugins/token-overview/scripts/backtest.mjs /path/to/report-slot`. The script reads existing snapshots and prints aggregate metrics without modifying usage history.

# Token Overview

The native Token Overview plugin adds a Settings entry and a local report at `/plugins/token-overview/report/`. The canonical `tokscale-token-report` Skill owns collection, fork/subagent deduplication, completed-day recovery, token definitions and API-equivalent prices. Deleting this plugin directory removes its functionality without changing the official core.

## Milestones and usage history

The cumulative chart measures the selected platform from its first recorded use through the selected end date. The start-date filter crops that lifetime curve instead of resetting its total. Token, output, call and API-equivalent cost tabs share this behavior. Major token milestones occur every 100 亿 tokens, with smaller early milestones; chart labels retain the 100 亿 landmark and avoid crowding. Weekly/monthly markers sit on their period-end chart points while the tooltip keeps the actual crossing date.

A compact rail shows the latest three reached milestones, their calendar/active-day counts, and remaining progress to the next node. Equal-volume stages compare elapsed calendar days. Record span, daily peak with leading-client attribution, and the longest consecutive active run explain the usage pattern. The full milestone list is collapsed; selecting a node focuses its point and, when necessary, uses the existing date filter to show its surrounding week. Settings adds one small all-history link below its existing metrics.

Milestone dates use daily totals, without inventing a crossing hour. A preceding estimated recovery can affect a later crossing date, so affected milestones are marked approximate. Natural-day span and active-day counts do not measure human working time. Costs remain API-equivalent estimates. `src/journey.js` owns the shared calculation; the plugin build embeds its browser bundle inside the existing report script, so the report remains portable without another asset request.

## Daily forecasting

Today's forecast updates every three minutes; the complete historical report updates every ten minutes. The browser polls cached snapshots every thirty seconds and preserves historical filters. Forecast dates and hourly boundaries use `Asia/Shanghai`. Historical date filters do not change the live day; the forecast reuses the report’s platform selector.

Settings shows today's observed and projected daily totals inside its existing usage trend. The eight three-hour bars stack solid observed usage with pale, dashed-border remaining predictions; pointer, touch and keyboard selection expose each period's observed tokens, predicted remainder and measured non-cache/call/cost detail. These rows use the same observation snapshot as the forecast. Missing measured detail remains unavailable, and the panel reports the cutoff, provisional estimates or delayed updates. Other date ranges continue to show measured usage only. This view reads the existing cached forecast and does not start another collector or model fit.

Trend summary amounts (including K/M/B/T abbreviations) and period token counts round to whole integers for display. Forecast calculations and stored observations retain their original precision.

The forecast stays a regular report section after growth momentum. Its single chart switches between hourly and cumulative usage. The hourly view groups three bars per hour: today (observed and remaining prediction stacked), yesterday, and the previous seven days' mean. Muted comparison bars share the same scale without crossing today's bars. The cumulative view keeps solid observed usage, dashed future usage, and historical comparison lines. Missing comparison days stay unavailable and reduced sample coverage is disclosed. Daily total, observed amount and remainder remain the only summary metrics; explanations and errors stay collapsed.

The nonlinear engine directly predicts future hours using the maintained mljs random forest, an observed-trajectory kernel and a seasonal kernel. Its inputs include hourly lags, activity/quiet duration, weekday, prior daily levels, calls and cache/output proportions. Whole-day forward errors select the blend; the old linear candidate and custom regression stumps are removed. A persistent worker trains off the Host event loop, bounds the expanded training rows, shares past-only weekly forest fits during historical scoring, and reuses fits while past input content stays unchanged. See [methodology and GitHub research](FORECASTING.md) for the selected algorithms and limits.

`hourly-history.json` lives under `$DSH_HOME/token-overview` independently of replaceable report slots. Each hourly observation retains its token, call, cost and cache components together. Later source-log deletion cannot reduce retained observations. A past client day participates in hourly training only after a closed-day scan reconciles with its protected daily total; explicitly estimated dates are excluded. Recent scans include yesterday to close the midnight boundary. Missing hours are never distributed across historical days.

Prediction ranges use prior forward residuals when enough positive days exist, otherwise a provisional wider range. Eight positive calibration days and eight positive complete hourly days are minimum support thresholds, not accuracy guarantees. The report distinguishes historical replay from predictions genuinely issued and later settled in `forecast-accuracy.json`. It reports total error and days within the 10% target; unseen new tasks prevent a per-day guarantee.

## Runtime and recovery

`refreshIntervalMs` defaults to 600000 and `forecastIntervalMs` to 180000 in the plugin config. `artifactRoot`, `reportScript` and `python` retain their existing overrides. A single serialized scheduler prevents full and incremental collectors from overlapping. Forecast calculation is limited to one third of the configured forecast interval, capped at sixty seconds; timeout terminates the worker before releasing the queue. Prediction failure retains the preceding forecast without preventing a completed historical report from publishing. Disposal awaits its prediction worker and collectors. Successful generations replace cached snapshots atomically; failed scans retain the preceding forecast and report. A corrupt hourly ledger fails visibly without discarding it. Forecast and report endpoints are read-only and do not trigger collection. The footer reports the actual observation cutoff; hourly tooltips show start and end times.

The forecast does not send messages, modify original session logs, change model settings, or call an inference provider.

## Verification

Install workspace dependencies, build with `node plugins/token-overview/scripts/build.mjs`, then run `node --test plugins/token-overview/test/*.test.mjs` from the repository root. Reproduce aggregate intraday backtests with `node plugins/token-overview/scripts/backtest.mjs /path/to/report-slot`. The script reads existing snapshots and prints aggregate metrics without modifying usage history.

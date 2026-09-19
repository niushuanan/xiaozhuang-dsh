# Agent Note: Token overview analysis report

English | [中文](2026-09-20-token-overview-analysis-report.zh.md)

Status: implemented

## Problem

The Token overview Settings section linked to a detailed report that only repeated the panel's totals as tables and two stacked bar charts. The collector already captures per-day, per-client and per-model series, so an audit of "where did this month's usage come from" still required reading raw artifacts. Hour-of-day rhythm was unavailable for anything except the current day, because collection ran a single scan that covered today.

## Decision

The [Token overview plugin](../../../../plugins/token-overview/package.json) owns the detailed report page. `assets/report.html` ships with the plugin and is served at `plugins/token-overview/report/`; the collector directory supplies only its data (`data.js`, `hourly.range.js`, `chart.umd.min.js`). The canonical `tokscale-token-report` Skill keeps collection, fork safety, history recovery, pricing and measurement semantics.

The page adds twelve analysis sections on top of the existing totals, tables and charts: cumulative growth with slope, growth rhythm with a seven-period moving average and moving-average change, linear forecast, composition doughnut by platform/vendor/token type, Pareto concentration, cost anatomy with cache savings, calendar heatmap, weekday-by-hour punchcard with an hourly profile, spike and trough detection against a local median baseline, model efficiency bubbles with a platform efficiency table, platform share migration, and model lifecycle spans.

Every section recomputes in the browser from the same immutable snapshot and follows the existing date, platform and grain controls. `hourly.range.js` carries `[...processedTokensPerClient, calls, cost]` for each day and hour of the report range. The collector produces it by running one Tokscale `hourly` scan per client over the report range plus the fork-safe DSH session scan, so the punchcard can follow the platform filter. The report degrades to a "分时数据准备中" note when that artifact is absent.

## Alternatives considered

**Keep serving the Skill's `report.html` and add sections to the Skill template.** The Skill is not a repository checkout, so the analysis would have had no reviewable source, tests, or release copy. Two templates cannot stay identical, so the plugin now owns presentation while the Skill keeps data.

**Derive hour rhythm from the existing daily artifacts.** No per-hour series exists in `data.js`; a single all-client hourly scan would also break the platform filter for that section.

**Add a second report page for analysis.** Two pages fragment one question ("what did I spend") across two entries; the sections belong in the same report, behind one link.

## Consequences

The plugin serves a page it owns, so plugin releases carry it and the artifact directory stays disposable. Each collection cycle adds five Tokscale `hourly` scans over the report range; they run in parallel and cost a few seconds next to the existing DSH session scan.

Cost anatomy and savings are estimates from the report's own pricing rows; unmatched models stay visible as an excluded token count. Forecasts extend a linear fit of the last fourteen periods and are labelled as such. Spike and trough detection uses range quantiles plus a local median baseline, so busy ranges report fewer "anomalies" instead of flagging ordinary variation.

## Testing

`test/host.test.mjs` covers the report range read, the per-client hourly merge with DSH boundary handling, and the presence of every analysis section plus the local data payload in the shipped page. The running plugin's report page was exercised in a real browser against a live collector snapshot: range and platform filters, grain switches, composition and heatmap toggles, and section navigation were checked with the empty-notice state intact.

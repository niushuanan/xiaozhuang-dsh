# Intraday Token Forecast Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for continuous implementation and one independent final review.

**Goal:** Predict today's final usage from observed hourly usage, refresh every three minutes, and expose fourteen useful daily dimensions in the existing Token Overview.

**Architecture:** The canonical Skill remains the usage and price authority. The plugin retains hourly observations, separates unavailable history from real zeros, computes a rolling-origin-weighted ensemble for the remaining day, and serves an atomic live forecast to the Settings view and detailed report. Full history collection retains its ten-minute cadence; today's scan runs between full scans without overlapping collectors.

**Tech Stack:** Existing Node.js ESM plugin, browser Chart.js, Node test runner; no separate service or new global runtime dependency.

**Spec:** The user-approved fourteen-dimension design in this chat, recorded below.

## Global Constraints

- Keep the existing processed-token and fork/subagent semantics and canonical pricing.
- Use Asia/Shanghai hour and date boundaries for forecast artifacts.
- Never compare hashes; inspect source, paths, content, behavior and Git command results.
- Preserve existing reports on collection failure and publish no mixed-generation data.
- Retain observed hourly history independently of the two replaceable report slots.
- Do not invent missing historical hours or use estimated days to evaluate intraday predictions.
- Forecast totals cannot fall below observed usage; platform forecasts and hourly remainders reconcile.
- Preserve the existing plugin directory removal contract and unrelated worktree files.

## Product Specification

The existing forecast section becomes a live daily view, independent of historical date filters and with its own platform choice. It shows final-day central estimate and an empirical 80% range, remaining usage, 24-hour observed/predicted curve, next 1/3/6-hour usage, same-time progress, weekday effects, recent acceleration, activity intensity, similar days, platform contribution, call intensity, cost/cache composition, a locally saved optional token budget, and revision/reliability explanations. Settings shows a compact today estimate and links to the same detailed section. Every view states its data cutoff and shows stale data honestly.

Candidate forecasts predict the remainder, using a recency-weighted robust daily prior, weekday prior, observed intraday fraction, recent intensity and similar days. A regularized boosted-tree candidate activates only with sufficient complete hourly days. Past-day forecasts use only earlier data; residual intervals and model weights use only completed rolling-origin errors. The product reports sample counts and errors by hour rather than a fabricated accuracy percentage. Sparse hourly history uses the daily prior with wider, explicitly provisional ranges.

## Review Focus

- Deleted raw logs must not reduce previously retained hourly observations.
- An unfinished hour must not become a completed zero or be counted twice.
- Platform filtering must not reuse all-platform calls, costs or intervals.
- A midnight transition must retain yesterday and start the new date.
- Failed refreshes must preserve the previous forecast and signal its age.

## Tasks

### Task 1: Forecast and retained hourly history

Files: `plugins/token-overview/src/forecast.js`, `src/forecast-history.js`, `test/forecast.test.mjs`.

Interfaces: `mergeForecastHistory(previous, hourly, data, now)` returns retained daily client observations and completeness; `buildForecast(history, options)` returns all/platform forecasts, cutoff, backtests and hourly series.

- [x] Add focused tests for observed-plus-remainder, missing-history exclusion, causal backtests, platform totals and hour retention; observe failure.
- [x] Implement robust/weekday/profile/analog/boosted candidates, rolling weights and empirical residual ranges.
- [x] Verify targeted tests and real snapshot backtests, with explicit sample limitations.

### Task 2: Collection and live delivery

Files: `plugins/token-overview/src/index.js`, `src/hourly-pricing.js`, `test/host.test.mjs`.

Interfaces: `/api/forecast` returns one cached forecast snapshot, `/api/report-data` returns one full report generation, existing `/api/status` additionally contains the compact forecast.

- [x] Add regression tests for three-minute live cadence, durable history and retained snapshot on failure; observe failure.
- [x] Add a serialized today/full scheduler, per-platform hourly metrics, persistent history and atomic forecast writes.
- [x] Build the plugin and verify the existing and new host tests.

### Task 3: Existing user entries

Files: `plugins/token-overview/assets/report.html`, `assets/forecast.js`, `assets/forecast.css`, `src/client.js`, `test/client-contract.test.mjs`, `test/report.test.mjs`.

- [x] Add meaningful report rendering and refresh tests; observe failure.
- [x] Implement the fourteen daily dimensions, charts, budget and automatic data replacement while preserving selected historical filters.
- [x] Verify Settings → detailed forecast → platform selection → budget → automatic refresh → return, including mobile containment.

### Task 4: Review, documentation and publication

Files: root bilingual README and pairing record, plugin README, `PROJECT_CONTEXT.md`, focused test results.

- [x] Inspect the whole change with a fresh reviewer and repair material findings.
- [x] Update current project context and bilingual documentation; run content/structure checks without digest comparisons.
- [x] Run relevant checks once, selectively commit, normally push the primary repository, and synchronize the affected standalone plugin from committed source.
- [x] Read back published files by content and report remaining accuracy limitations.

## Execution Record

- Initial state: only two unrelated untracked duplicate instruction files; leave both untouched.
- Baseline: old fourteen-day linear next-day WAPE 60.7% over 2026-09-15 through 2026-10-14; only six all-platform hourly days reconcile with protected daily totals.
- Ruling: implement continuously in the existing checkout under the user's explicit request to finish, commit and push; no extra design approval round or worktree setup. Cost if wrong: changes remain a narrowly scoped commit for review.

- Tasks 1–3: focused collection, history, forecast and rendering checks reached 25 passing cases; source tests were observed failing before their implementations. The real page then exposed daily-prior saturation, reproduced and repaired by estimating remaining-hour workload independently of observed usage.
- Final review: one independent reviewer found five material issues. Each is repaired with a reproduced failing behavior: elapsed-only call/cost/cache metrics, closed-day retention at midnight, positive-day calibration support, remainder/hour reconciliation and connection-loss notice.
- Final: Ruling: treat the reviewer's date-boundary minor as material to an always-open daily report, and fix it with the midnight date-boundary regression; cost if wrong: the calendar follows newly available report days while preserving the selected historical start.
- Final: fixed unequal recent-intensity windows at fractional hours; the same forecast test pins two consecutive three-hour windows.

- Final verification: 26 focused cases pass; incremental Host/Client typecheck and scoped lint pass. Real 3080 Settings/report/platform/budget/hourly/chart/price paths verified. Narrow viewport override was unavailable (requested 390, measured 1172), so no mobile pass is claimed. Global Markdown links pass; global wrap check reports a pre-existing 2026-10-06 plan; changed Markdown passes scoped AST checks.
- Final: fixed the real-page daily-prior saturation and hourly component transfer with failing regressions before fixes; no fixed accuracy percentage is claimed.

- Delivery verified: primary master pushed; standalone 1.2.0 pushed from committed main source. Nine primary files and nineteen standalone payload files read back by content. Real Safari desktop automatically advanced from the 17:25 snapshot to 17:28 without navigation. Original two unrelated instruction-file duplicates remain untouched.

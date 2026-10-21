# Calendar-month cumulative forecast

The cumulative chart keeps recorded usage intact and appends one calendar month after the selected end date. The solid line is recorded history, the dashed line is the forecast, and the shaded region is an empirical 80% reference range. The axis includes the projected range; future milestone labels say “预计”. Token, calls, output and API-equivalent cost use the same view-specific calculation. Forecasts are estimates of future activity, not committed work or invoices.

## Inputs and models

Only observations through the selected cutoff enter a calculation. Today’s partial amount remains in the actual cumulative total but is excluded from training. The expected remainder of today is included before future days. Explicit estimated-recovery dates and dates without records remain unavailable as training labels. Real recorded zero-use days remain zero. Original observations and the history lock are never modified by forecasting.

Six candidates cover recent level, weekly seasonality, trends and repeated activity patterns: two- and six-week same-weekday means, robust recency-weighted trends over 28 and 56 days with damping, damped Holt smoothing after weekly adjustment, and a nearest-trajectory predictor. The trajectory predictor compares normalized 21-day prefixes, takes up to five similar completed historical paths aligned to the weekday, and rescales their already-observed future segments to the current level. No candidate can read beyond its training cutoff.

Robust fits downweight isolated residuals during estimation without editing history. Damping limits indefinite trend continuation. Candidates predict nonnegative daily amounts; the cumulative forecast starts at the actual total. The bounded calculations run locally in the existing report and require no model downloads, external inference calls or extra collection process.

## Rolling validation and reference range

Weekly forecast origins cover at most the previous 147 days, with a minimum 21-day initial history and up to 31 future days per fold. Each origin fits candidates on preceding observations only. Ensemble weights use only earlier folds whose whole evaluation window has finished before that origin. Recency-weighted errors at 7, 14 and up to 31 days determine inverse-square weights. A forecast does not select its weights using its own future outcome.

The displayed comparison uses the absolute errors of complete 31-day incremental totals divided by their summed actual incremental totals (WAPE). The baseline predicts the same window with the preceding seven-day mean. Dividing by lifetime cumulative totals would hide forecast errors, so lifetime totals are not the scoring denominator. Overlapping origins are correlated; the fold count is not an independent-sample count.

The band uses the 10th and 90th percentiles of earlier ensemble cumulative errors at each horizon, normalized to the origin’s recent level and scaled to current activity. It includes the point forecast and is constrained to nondecreasing cumulative bounds. Fewer than five supporting folds use a wider provisional range. Dormant histories with no recent activity cannot predict the arrival of unannounced new tasks. Neither the band nor historical WAPE guarantees future coverage or accuracy.

## Evidence and verification

The initial whole-machine replay on the local 2026-10-21 dataset produced roughly 29% error on month-increment forecasts, close to the seven-day mean baseline. Results vary by platform and are shown for the selected data; no universal improvement or 10% accuracy claim is made. The report recalculates after corrected pricing snapshots arrive, so cost forecasts use the repaired price basis.

Run `node --test plugins/token-overview/test/growth-forecast.test.mjs plugins/token-overview/test/report.test.mjs`. The focused cases cover a rising series, weekly activity, cutoff isolation, partial/estimated observations and the rendered forecast datasets. Validate the real report’s date, platform, model and daily/weekly/monthly controls after changes.

The model choices follow [damped exponential smoothing](https://otexts.com/fpp3/exponential-smoothing.html), [rolling forecast evaluation](https://otexts.com/fpp3/toolbox.html) and [forecast combinations](https://otexts.com/fpp3/combinations.html). These sources motivate methods; the local replay supplies the application-specific evidence.

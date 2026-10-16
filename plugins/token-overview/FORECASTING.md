# Daily forecast methodology

## Scope and accuracy target

The forecast answers how much this machine will use by midnight in Asia/Shanghai. Version 1.3 predicts individual remaining hours, adds them to observed usage, and reconciles the all-platform result with its client forecasts. It does not extrapolate a straight trend or spread a predicted daily remainder over an average hourly shape.

The product target is an absolute daily percentage error of at most 10%. This is an objective, not a per-day guarantee. An unannounced afternoon job changes the target without an observable earlier cause. Neither a smaller displayed range nor a more complex model establishes accuracy. This revision has not been tested or backtested at the user's request; no improvement percentage or attained error rate is claimed.

## Research and selection

The following primary repositories and implementation references were reviewed on 2026-10-16. Their published capabilities describe approaches, not evidence of performance on this machine's usage.

| Reference | Relevant approach | Decision for this plugin |
| --- | --- | --- |
| [Nixtla MLForecast](https://github.com/Nixtla/mlforecast) and its [forecast implementation](https://github.com/Nixtla/mlforecast/blob/main/mlforecast/forecast.py) | Lag features, calendar covariates, direct versus recursive prediction, temporal cross-validation, residual intervals | Use observed covariates and a target-hour covariate to predict each horizon directly; do not feed predicted hours back as observations. |
| [scikit-learn lagged-feature example](https://github.com/scikit-learn/scikit-learn/blob/main/examples/applications/plot_time_series_lagged_features.py) | Nonlinear trees over lagged and rolling features; temporal splits; separate uncertainty from point estimates | Keep every row belonging to one day in that day's temporal fold. Rolling features use earlier data. A shuffled/OOB score does not certify forecasting accuracy. |
| [mljs random-forest](https://github.com/mljs/random-forest), [regression implementation](https://github.com/mljs/random-forest/blob/master/src/RandomForestRegression.js) and [CART](https://github.com/mljs/decision-tree-cart) | Bagged CART regression with feature subspaces, bounded depth, model serialization | Use the maintained JavaScript regressor, bundled into the worker. No new Python ML installation, downloaded model weights or inference API is required. |
| [River adaptive random forest](https://riverml.xyz/latest/api/forest/ARFRegressor/) and [repository](https://github.com/online-ml/river) | Progressive evaluation and response to concept drift | Track predictions genuinely issued before outcomes, and give recent settled errors more influence in expert selection. This implementation does not claim to implement River's ARF or ADWIN. |
| [StatsForecast](https://github.com/Nixtla/statsforecast) | Statistical seasonality and intermittent-demand methods such as Croston/TSB | Retain observed quiet hours, quiet-run duration and empirical activity frequency. A stationary intermittent-rate model alone does not condition on this morning's task intensity. |
| [Amazon Chronos](https://github.com/amazon-science/chronos-forecasting) | Pretrained probabilistic, multivariate and covariate-informed forecasting | Reviewed as an alternative. Model downloads and an additional tensor runtime are not introduced without measured evidence that they improve this workload. |

## Input integrity and features

The canonical collection Skill and `hourly-history.json` retain their existing token definitions and protection. Incomplete or explicitly estimated client days cannot become hourly training labels. Later source-log deletion cannot lower a retained observation. Partial current-hour observations remain measured totals; historical error evaluation uses whole-hour boundaries rather than inventing minute observations.

The direct regressor uses 33 inputs: cutoff and horizon; cyclical target hour and weekday; observed cumulative amount and past daily level; expected prefix fraction; active-hour fraction and trailing quiet duration; one-, two-, three- and six-hour rates; four recent three-hour windows; yesterday and week-ago target-hour amounts with availability flags; recent target-hour amount and activity frequency; recent daily mean; calls per hour and tokens per call; cache/output proportions and measurement-availability flags. Missing historical detail has an availability flag and is never presented as a measured zero.

Amplitude normalization uses only earlier daily totals and the observed target-day prefix. Training origins without an earlier positive daily scale are omitted. A target day's final total and unobserved future hours are labels, never its input features. Known completed reference days may supply their full trajectories to the kernel predictor.

## Predictors and selection

The direct forest trains on completed client days, multiple whole-hour origins and their future target hours. The target is that hour's nonnegative token amount normalized by a causal daily scale. A deterministic stratified sample retains at most 256 origin/horizon rows spread across the training days, with 40 bagged CART trees, 80% feature subspaces, maximum depth seven and a minimum split sample count of eight. CART evaluates candidate splits by scanning rows; bounding the expanded training set prevents the day × origin × horizon expansion from exhausting the refresh interval. Multiple origin/horizon rows do not create independent days; sample support is reported in days. The candidate becomes available after three complete positive client days and usable earlier scales, rather than waiting for 28 days. This bounded model generation uses a separate issued-accuracy record and does not imply improved accuracy without settled outcomes.

The trajectory kernel compares the observed prefix, recent windows, quiet duration, weekday and recency against up to nine completed reference days. Adaptive exponential weights produce a conditional hourly trajectory. A recency/weekday seasonal kernel supplies a conservative alternative. Recent whole-day forward errors determine the relative expert weights; absent evidence, the forest has a limited initial weight. Fixed seeds make equivalent inputs reproducible. The new predictors have not been empirically ranked against the previous implementation in this revision.

Each future hour is predicted independently. For the open hour, the already measured amount is subtracted from its estimated full-hour amount, with a lower bound of zero remaining. Summing the hourly remainder gives the daily remainder; already observed usage is never predicted away. This also allows later quiet or active hours to differ instead of flattening the whole afternoon.

Past-only expanding folds evaluate reference times 08:00, 12:00, 16:00 and 20:00. Historical forest fits expand at Monday boundaries and are shared by that week's scored days; only completed days before the week enter a fit. The live model trains through yesterday. Scoring still uses each target day's observed prefix and whole-day outcome, without training on any day being scored. Signed residuals, normalized by each fold's causal level, provide an empirical range after at least eight positive calibration days and eight positive complete hourly days. Until then a wider range is marked provisional. These are support thresholds, not coverage or accuracy guarantees under changed usage.

## Issued predictions and the 10% objective

`forecast-accuracy.json` records the first issued prediction in each Shanghai hour, per date, client and model generation, for up to 56 days. Later updates do not replace an earlier issued forecast to improve the score. Outcomes settle only after a closed, non-estimated day reconciles its observed hours with protected daily totals. The all-platform result settles on a common complete day. Different model generations remain separate.

For positive-usage outcomes the report exposes WAPE, average daily percentage error, the number of days within 10%, and the worst daily percentage error. Zero-usage outcomes are counted separately because a percentage error is undefined. Live outcomes are separate from historical replay. “No settled predictions” is displayed until real outcomes exist; retrospectively recomputed estimates cannot populate that record.

## Chart and runtime

One existing report section contains either a cumulative line chart or the hourly bars. Observed cumulative usage is solid blue, the forecast starts at the exact observation cutoff with a dashed blue line, and yesterday/previous-seven-calendar-day average curves provide context. Missing comparisons are omitted. A seven-day average uses only available complete days and discloses a denominator below seven; the all-platform curve uses the same complete calendar days across clients.

The serialized collector sends a snapshot to one persistent Node worker. Past-only feature contexts, model fits and historical selection are cached until the actual past input content changes, without digest comparisons. Each calculation has a deadline of one third of the configured forecast interval, capped at sixty seconds; a timed-out worker is terminated and awaited before releasing the queue. The next scheduled update can retry. The worker's lifecycle belongs to the collector; disposal rejects pending work and awaits termination. Measured hourly history is committed before model work, so a training failure retains both observations and the prior published forecast. A prediction failure does not prevent publishing a successfully collected historical report. Forecast calculation remains on the three-minute schedule, with browser reads every thirty seconds and historical collection every ten minutes. Hourly tooltips show the interval (for example, 13:00–14:00); completed hours have no predicted remainder in a fresh snapshot. The footer keeps the actual observation cutoff and distinguishes an ongoing update from a delayed snapshot.

The build bundles the forest dependency into `lib/forecast-forest.js`. Its dependency licenses are preserved in [third-party notices](THIRD_PARTY_NOTICES.md). The plugin does not modify source sessions, upload usage data or call a prediction provider.

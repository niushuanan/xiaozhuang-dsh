/** Direct multi-horizon regression using the maintained mljs CART forest. */
import { RandomForestRegression } from 'ml-random-forest'
import { contextFor, horizonFeatures, age } from './forecast-context.js'

const ORIGINS = [0, 3, 6, 8, 9, 12, 15, 16, 18, 20, 21, 23]
// CART scans each split against every row; bound the origin/horizon expansion before fitting.
const MAX_TRAIN_ROWS = 256

/** Fit one past-only client model; rows from a day always stay in the same temporal fold. */
export function fitHourlyForest(days, client, date, contextAt = (target, cut) => contextFor(days, client, target, cut)) {
  const complete = days.filter(day => day.date < date && age(date, day.date) <= 56 && !day.estimated && day.complete[client])
  const positive = complete.filter(day => day.totals[client]?.tokens > 0)
  if (positive.length < 3) return null
  const trainingDays = complete.filter(day => day.date >= positive[0].date).slice(-28)
  const targets = []
  for (const day of trainingDays) {
    for (const cut of ORIGINS) {
      const context = contextAt(day.date, cut)
      if (!context.past.slice(-28).some(before => before.totals[client].tokens > 0)) continue
      for (let hour = cut; hour < 24; hour++) {
        targets.push({ context, hour, value: day.hours[client][hour].tokens / context.scale })
      }
    }
  }
  if (!targets.length) return null
  // Systematic strata span all retained days and horizons, rather than truncating the oldest rows.
  const size = Math.min(MAX_TRAIN_ROWS, targets.length)
  const selected = Array.from({ length: size }, (_, index) => targets[Math.floor((index + .5) * targets.length / size)])
  const x = selected.map(row => horizonFeatures(row.context, row.hour))
  const y = selected.map(row => row.value)
  const forest = new RandomForestRegression({ nEstimators: 40, maxFeatures: .8, replacement: false,
    seed: 16102026, noOOB: true, treeOptions: { maxDepth: 7, minNumSamples: 8 } })
  forest.train(x, y)
  return { forest, days: trainingDays.length, positiveDays: positive.length, rows: x.length }
}

/** Each target hour is predicted directly from observed covariates, without recursive forecasts. */
export function forestHours(model, context) {
  if (!model || context.cut >= 24) return null
  const first = Math.floor(context.cut)
  const targets = Array.from({ length: 24 - first }, (_, index) => index + first)
  const predictions = model.forest.predict(targets.map(hour => horizonFeatures(context, hour)))
  return Array.from({ length: 24 }, (_, hour) => {
    if (hour < first) return 0
    const full = Math.max(0, predictions[hour - first] * context.scale)
    return hour === first ? Math.max(0, full - context.observed[hour].tokens) : full
  })
}

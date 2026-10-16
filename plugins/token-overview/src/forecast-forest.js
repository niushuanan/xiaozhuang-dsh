/** Direct multi-horizon regression using the maintained mljs CART forest. */
import { RandomForestRegression } from 'ml-random-forest'
import { contextFor, horizonFeatures, age } from './forecast-context.js'

const ORIGINS = [0, 3, 6, 8, 9, 12, 15, 16, 18, 20, 21, 23]

/** Fit one past-only client model; rows from a day always stay in the same temporal fold. */
export function fitHourlyForest(days, client, date) {
  const complete = days.filter(day => day.date < date && age(date, day.date) <= 56 && !day.estimated && day.complete[client])
  const positive = complete.filter(day => day.totals[client]?.tokens > 0)
  if (positive.length < 3) return null
  const trainingDays = complete.filter(day => day.date >= positive[0].date).slice(-28)
  const x = [], y = []
  for (const day of trainingDays) {
    for (const cut of ORIGINS) {
      const context = contextFor(days, client, day.date, cut)
      if (!context.past.some(before => before.totals[client].tokens > 0)) continue
      for (let hour = cut; hour < 24; hour++) {
        x.push(horizonFeatures(context, hour))
        y.push(day.hours[client][hour].tokens / context.scale)
      }
    }
  }
  if (!x.length) return null
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

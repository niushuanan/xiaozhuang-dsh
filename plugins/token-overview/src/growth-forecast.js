/** Calendar-month forecasts with causal rolling validation and empirical cumulative error bands. */
const DAY = 86400000
const sum = values => values.reduce((total, value) => total + value, 0)
const mean = values => values.length ? sum(values) / values.length : 0
const iso = time => new Date(time).toISOString().slice(0, 10)
const weekday = date => new Date(date + 'T00:00:00Z').getUTCDay()
const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * p)] || 0
}
const cumulative = values => {
  let total = 0
  return values.map(value => total += value)
}

function monthAfter(date) {
  const current = new Date(date + 'T00:00:00Z')
  const last = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 2, 0)).getUTCDate()
  return Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, Math.min(current.getUTCDate(), last))
}

function seasonalFactors(rows) {
  const recent = rows.slice(-56).filter(row => row.value !== null)
  const level = mean(recent.map(row => row.value))
  return Array.from({ length: 7 }, (_, day) => {
    const values = recent.filter(row => weekday(row.date) === day).map(row => row.value)
    const support = values.length / (values.length + .5)
    return level > 0 ? Math.max(.05, 1 + (mean(values) / level - 1) * support) : 1
  })
}

function robustLine(rows, factors, window) {
  const points = rows.slice(-window).map((row, index, all) => ({ x: index - all.length + 1,
    y: row.value === null ? null : row.value / factors[weekday(row.date)] })).filter(row => row.y !== null)
  let level = mean(points.map(row => row.y)), slope = 0
  for (let pass = 0; pass < 3; pass++) {
    const scale = Math.max(1e-9, quantile(points.map(row => Math.abs(row.y - level - slope * row.x)), .5) * 1.4826)
    const weighted = points.map(row => ({ ...row, weight: Math.pow(.5, -row.x / (window / 2))
      * (pass ? Math.min(1, 2.5 * scale / Math.max(1e-9, Math.abs(row.y - level - slope * row.x))) : 1) }))
    const weight = sum(weighted.map(row => row.weight)) || 1
    const x = sum(weighted.map(row => row.weight * row.x)) / weight
    const y = sum(weighted.map(row => row.weight * row.y)) / weight
    const variance = sum(weighted.map(row => row.weight * (row.x - x) ** 2))
    slope = variance ? sum(weighted.map(row => row.weight * (row.x - x) * (row.y - y))) / variance : 0
    level = y - slope * x
  }
  return { level: Math.max(0, level), slope }
}

function candidates(rows, length) {
  const factors = seasonalFactors(rows)
  const lastTime = Date.parse(rows.at(-1).date + 'T00:00:00Z')
  const future = Array.from({ length }, (_, index) => iso(lastTime + (index + 1) * DAY))
  const seasonal = window => future.map(date => {
    const recent = rows.slice(-window).filter(row => row.value !== null)
    const matches = recent.filter(row => weekday(row.date) === weekday(date))
    return matches.length ? mean(matches.map(row => row.value)) : mean(recent.map(row => row.value))
  })
  const trend = (window, damping) => {
    const fit = robustLine(rows, factors, window)
    let distance = 0
    return future.map((date, index) => {
      distance += damping ** (index + 1)
      return Math.max(0, fit.level + fit.slope * distance) * factors[weekday(date)]
    })
  }
  const valid = rows.slice(-84).filter(row => row.value !== null)
  let level = mean(valid.slice(0, 7).map(row => row.value)), slope = 0
  for (const row of valid) {
    const value = row.value / factors[weekday(row.date)]
    const previous = level
    level = .3 * value + .7 * (level + .94 * slope)
    slope = .08 * (level - previous) + .92 * .94 * slope
  }
  let distance = 0
  const holt = future.map((date, index) => {
    distance += .94 ** (index + 1)
    return Math.max(0, level + distance * slope) * factors[weekday(date)]
  })
  // Match complete past trajectories; their future segment must already be observed.
  const prefix = rows.slice(-21)
  const levelNow = mean(prefix.filter(row => row.value !== null).map(row => row.value))
  const neighbors = []
  for (let end = rows.length - 7 * Math.ceil(length / 7); end >= 21; end -= 7) {
    const history = rows.slice(end - 21, end), outcome = rows.slice(end, end + length)
    if (history.some(row => row.value === null) || outcome.some(row => row.value === null)) continue
    const levelThen = mean(history.map(row => row.value))
    if (!levelThen || !levelNow) continue
    const shape = mean(history.map((row, i) => Math.abs(row.value / levelThen - (prefix[i].value || 0) / levelNow)))
    const changeNow = mean(prefix.slice(-7).map(row => row.value || 0)) / levelNow
    const changeThen = mean(history.slice(-7).map(row => row.value)) / levelThen
    const distance = shape + Math.abs(changeNow - changeThen)
    neighbors.push({ distance, age: rows.length - end, values: outcome.map(row => row.value * levelNow / levelThen) })
  }
  const nearest = neighbors.sort((a, b) => a.distance - b.distance).slice(0, 5)
  const weights = nearest.map(row => Math.exp(-row.distance) * Math.pow(.5, row.age / 112))
  const analog = nearest.length ? future.map((_, i) => sum(nearest.map((row, j) => row.values[i] * weights[j])) / sum(weights)) : seasonal(14)
  return [seasonal(14), seasonal(42), trend(28, .985), trend(56, .96), holt, analog]
}

function ensembleWeights(folds, origin) {
  const settled = folds.filter(fold => fold.end <= origin)
  if (!settled.length) return Array(6).fill(1 / 6)
  const scores = Array.from({ length: 6 }, (_, model) => {
    let error = 0, mass = 0
    for (const fold of settled) {
      const weight = Math.pow(.5, (origin - fold.end) / 42)
      error += weight * fold.loss[model]
      mass += weight
    }
    return 1 / (.04 + error / mass) ** 2
  })
  return scores.map(score => score / sum(scores))
}

const blend = (predictions, weights) => predictions[0].map((_, index) =>
  predictions.reduce((total, prediction, model) => total + prediction[index] * weights[model], 0))

/** Only observations on/before `through` are available; partial today and estimated dates are not labels. */
export function buildGrowthForecast({ days, values, through, estimatedDates = [], currentDate }) {
  const estimated = new Set(estimatedDates)
  const observations = days.map((date, index) => ({ date, value: Math.max(0, Number(values[index]) || 0) }))
    .filter(row => row.date <= through)
  const first = observations.findIndex(row => row.value > 0)
  if (first < 0) return null
  const observed = sum(observations.map(row => row.value))
  const origin = through
  const byDate = new Map(observations.map(row => [row.date, row.value]))
  const actualToday = origin === currentDate ? byDate.get(origin) || 0 : null
  const start = Date.parse(observations[first].date + 'T00:00:00Z')
  const stop = Date.parse(origin + 'T00:00:00Z') - (actualToday === null ? 0 : DAY)
  const rows = Array.from({ length: Math.max(0, Math.round((stop - start) / DAY) + 1) }, (_, index) => {
    const date = iso(start + index * DAY)
    return { date, value: estimated.has(date) || !byDate.has(date) ? null : byDate.get(date) }
  })
  if (!rows.some(row => row.value !== null && row.value > 0)) return null
  const n = rows.length, folds = []
  for (let cut = Math.max(21, n - 147); cut + 7 <= n; cut += 7) {
    const length = Math.min(31, n - cut)
    const actual = rows.slice(cut, cut + length)
    if (actual.some(row => row.value === null || row.date === currentDate)) continue
    const train = rows.slice(0, cut)
    const scale = mean(train.slice(-28).filter(row => row.value !== null).map(row => row.value))
    if (!scale) continue
    const predictions = candidates(train, length)
    const truth = cumulative(actual.map(row => row.value))
    const predicted = cumulative(blend(predictions, ensembleWeights(folds, cut)))
    const checkpoints = [...new Set([7, 14, length])].filter(day => day <= length)
    const loss = predictions.map(prediction => {
      const totals = cumulative(prediction)
      return mean(checkpoints.map(day => Math.abs(totals[day - 1] - truth[day - 1]) / Math.max(scale * day, truth[day - 1])))
    })
    const baseline = mean(train.slice(-7).filter(row => row.value !== null).map(row => row.value))
    folds.push({ end: cut + length, scale, truth, predicted, loss,
      baseline: truth.map((_, index) => baseline * (index + 1)) })
  }
  const monthEnd = monthAfter(origin)
  const length = Math.round((monthEnd - Date.parse(origin + 'T00:00:00Z')) / DAY)
  const padding = actualToday === null ? 0 : 1
  const weights = ensembleWeights(folds, n)
  const prediction = blend(candidates(rows, length + padding), weights)
  const remainingToday = padding ? Math.max(0, prediction.shift() - actualToday) : 0
  const totals = cumulative(prediction)
  const scale = Math.max(mean(rows.slice(-28).filter(row => row.value !== null).map(row => row.value)), mean(rows.slice(-84).filter(row => row.value !== null).map(row => row.value)))
  let previousLower = observed, previousUpper = observed
  const daily = totals.map((value, index) => {
    const errors = folds.filter(fold => fold.truth.length > index).map(fold =>
      (fold.truth[index] - fold.predicted[index]) / fold.scale * scale)
    const fallback = scale * (.8 * Math.sqrt(index + 1) + .2 * (index + 1))
    const lowError = errors.length >= 5 ? Math.min(0, quantile(errors, .1)) : -fallback
    const highError = errors.length >= 5 ? Math.max(0, quantile(errors, .9)) : fallback
    const center = observed + remainingToday + value
    previousLower = Math.max(previousLower, observed + Math.max(0, remainingToday + value + lowError))
    previousUpper = Math.max(previousUpper, center + highError)
    return { date: iso(Date.parse(origin + 'T00:00:00Z') + (index + 1) * DAY), value: prediction[index],
      cumulative: center, lower: Math.min(center, previousLower), upper: previousUpper }
  })
  const complete = folds.filter(fold => fold.truth.length === 31)
  const actualMass = sum(complete.map(fold => fold.truth.at(-1)))
  const error = key => actualMass ? sum(complete.map(fold => Math.abs(fold[key].at(-1) - fold.truth.at(-1)))) / actualMass : null
  return { origin, through: iso(monthEnd), observed, remainingToday, daily, total: daily.at(-1).cumulative,
    additional: daily.at(-1).cumulative - observed, lower: daily.at(-1).lower, upper: daily.at(-1).upper,
    trainingDays: rows.filter(row => row.value !== null).length, provisional: complete.length < 5,
    weights, backtest: { folds: complete.length, horizon: 31, wape: error('predicted'), baselineWape: error('baseline') } }
}

/** Causal hourly forecasts and rolling-origin evaluation, independent of browser and filesystem. */
import { forecastClock, TIME_ZONE } from './forecast-history.js'

const sum = values => values.reduce((n, value) => n + value, 0)
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const average = values => values.length ? sum(values) / values.length : 0
const age = (date, before) => (Date.parse(date) - Date.parse(before)) / 86400000
const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay()
const EXPERTS = ['recent', 'linear', 'weekday', 'profile', 'momentum', 'analog', 'boosted']
const LABELS = { recent: '近期稳健基线', linear: '趋势基线', weekday: '星期节律', profile: '今日进度', momentum: '近期强度', analog: '相似历史日', boosted: '条件提升树' }
const CUTS = [8, 12, 16, 20]

function linearBaseline(past, client) {
  const values = past.slice(-14).map(day => day.totals[client].tokens)
  if (!values.length) return 0
  const center = (values.length - 1) / 2, mean = average(values)
  const denominator = sum(values.map((_, i) => (i - center) ** 2))
  const slope = denominator > 0 ? sum(values.map((value, i) => (i - center) * (value - mean))) / denominator : 0
  return Math.max(0, mean + slope * (values.length - center))
}

function quantile(values, q) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * (sorted.length + 1)) - 1))]
}

function weightedMedian(rows) {
  const sorted = [...rows].sort((a, b) => a.value - b.value)
  const half = sum(rows.map(row => row.weight)) / 2
  let running = 0
  for (const row of sorted) { running += row.weight; if (running >= half) return row.value }
  return 0
}

function pastDays(days, client, date) {
  return days.filter(day => day.date < date && !day.estimated && day.totals[client] !== undefined).slice(-84)
}

function priorFor(past, client, date, seasonal = false) {
  const recent = past.slice(-28)
  return weightedMedian(recent.map(day => ({ value: day.totals[client].tokens,
    weight: Math.exp(-age(date, day.date) / 21) * (seasonal && weekday(date) === weekday(day.date) ? 4 : 1) })))
}

function shapeFor(past, client, date) {
  const complete = past.filter(day => day.complete[client] && day.totals[client].tokens > 0).slice(-56)
  const shape = Array(24).fill(0)
  let mass = 0
  for (const day of complete) {
    const weight = Math.exp(-age(date, day.date) / 28) * (weekday(date) === weekday(day.date) ? 2 : 1)
    const total = sum(day.hours[client].map(row => row.tokens))
    day.hours[client].forEach((row, hour) => { shape[hour] += row.tokens / total * weight })
    mass += weight
  }
  return { shape: mass > 0 ? shape.map(value => value / mass) : Array(24).fill(1 / 24), complete }
}

function prefix(hours, cut, metric = 'tokens') {
  return sum(hours.map((row, hour) => hour < Math.floor(cut) ? (row[metric] || 0)
    : hour === Math.floor(cut) ? (row[metric] || 0) * (cut % 1) : 0))
}

function profilePrefix(shape, cut) {
  return sum(shape.map((value, hour) => value * clamp(cut - hour, 0, 1)))
}

function observedWindow(hours, start, end, cut) {
  return sum(hours.map((row, hour) => {
    const observedSpan = clamp(cut - hour, 0, 1)
    const overlap = Math.max(0, Math.min(hour + 1, cut, end) - Math.max(hour, start))
    return observedSpan > 0 ? row.tokens * overlap / observedSpan : 0
  }))
}

function observations(day, client, cut, live) {
  const source = day?.hours[client] || Array.from({ length: 24 }, () => ({ tokens: 0, calls: null, cost: null, cacheTokens: null, outputTokens: null }))
  // Live rows already contain just the elapsed part of the open hour.
  return source.map((row, hour) => {
    const fraction = live ? (hour <= Math.floor(cut) ? 1 : 0) : clamp(cut - hour, 0, 1)
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? null : value * fraction]))
  })
}

function features(hours, cut) {
  const actual = prefix(hours, cut)
  const last = prefix(hours, cut) - prefix(hours, Math.max(0, cut - 3))
  const active = hours.slice(0, Math.ceil(cut)).filter(row => row.tokens > 0).length
  return [Math.log1p(actual), Math.log1p(last), active / Math.max(1, cut), cut / 24]
}

// Shrunk gradient-boosted regression stumps. Minimum complete-day support and
// rolling-origin loss determine whether the candidate receives any live weight.
function boostedRemainder(complete, client, cut, current) {
  if (complete.length < 28) return null
  const rows = complete.map(day => ({ x: features(day.hours[client], cut), y: Math.log1p(Math.max(0, sum(day.hours[client].map(h => h.tokens)) - prefix(day.hours[client], cut))) }))
  const point = features(current, 24)
  point[1] = Math.log1p(observedWindow(current, Math.max(0, cut - 3), cut, cut))
  point[2] = current.filter(row => row.tokens > 0).length / Math.max(1, cut)
  point[3] = cut / 24
  const fitted = rows.map(() => average(rows.map(row => row.y)))
  let result = fitted[0]
  for (let iteration = 0; iteration < 16; iteration++) {
    const residuals = rows.map((row, i) => row.y - fitted[i])
    let best
    for (let feature = 0; feature < 3; feature++) {
      for (const q of [.25, .5, .75]) {
        const threshold = quantile(rows.map(row => row.x[feature]), q)
        const left = rows.map((row, i) => row.x[feature] <= threshold ? i : -1).filter(i => i >= 0)
        const right = rows.map((row, i) => row.x[feature] > threshold ? i : -1).filter(i => i >= 0)
        if (left.length < 7 || right.length < 7) continue
        const lo = average(left.map(i => residuals[i])), hi = average(right.map(i => residuals[i]))
        const error = sum(left.map(i => (residuals[i] - lo) ** 2)) + sum(right.map(i => (residuals[i] - hi) ** 2))
        if (!best || error < best.error) best = { feature, threshold, lo, hi, error }
      }
    }
    if (!best) break
    fitted.forEach((_, i) => { fitted[i] += .1 * (rows[i].x[best.feature] <= best.threshold ? best.lo : best.hi) })
    result += .1 * (point[best.feature] <= best.threshold ? best.lo : best.hi)
  }
  return Math.max(0, Math.expm1(result))
}

function candidates(days, client, date, cut, live = false, cache) {
  const key = `${client}/${date}/${cut}/${live}`
  if (cache?.has(key)) return cache.get(key)
  const past = pastDays(days, client, date)
  const day = days.find(row => row.date === date)
  const observed = observations(day, client, cut, live)
  const actual = sum(observed.map(row => row.tokens))
  const prior = priorFor(past, client, date)
  const seasonal = priorFor(past, client, date, true)
  const { shape, complete } = shapeFor(past, client, date)
  const fraction = profilePrefix(shape, cut)
  const remainingShare = Math.max(0, 1 - fraction)
  const strength = clamp(complete.length / 14, 0, 1)
  const progressRatio = prior * fraction > 0 ? actual / (prior * fraction) : 1
  const progressScale = clamp(1 + (progressRatio - 1) * Math.min(.9, cut / 12) * strength, .05, 6)
  const last = observedWindow(observed, Math.max(0, cut - 3), cut, cut)
  const expectedLast = prior * (profilePrefix(shape, cut) - profilePrefix(shape, Math.max(0, cut - 3)))
  const momentumScale = expectedLast > 0 ? clamp(last / expectedLast, .05, 6) : progressScale
  const analogs = complete.map(row => {
    const before = prefix(row.hours[client], cut)
    const latest = before - prefix(row.hours[client], Math.max(0, cut - 3))
    const score = Math.abs(Math.log1p(before) - Math.log1p(actual)) + .5 * Math.abs(Math.log1p(latest) - Math.log1p(last))
      + age(date, row.date) / 90 + (weekday(row.date) === weekday(date) ? 0 : .15)
    return { date: row.date, score, total: sum(row.hours[client].map(h => h.tokens)), before, remaining: Math.max(0, sum(row.hours[client].map(h => h.tokens)) - before) }
  }).sort((a, b) => a.score - b.score).slice(0, 7)
  const analog = analogs.length >= 3 ? weightedMedian(analogs.map(row => ({ value: row.remaining, weight: 1 / (.2 + row.score) }))) : null
  const boosted = boostedRemainder(complete, client, cut, observed)
  const values = {
    recent: prior * remainingShare, linear: linearBaseline(past, client) * remainingShare, weekday: seasonal * remainingShare,
    profile: complete.length >= 3 ? prior * remainingShare * progressScale : null,
    momentum: complete.length >= 3 ? prior * remainingShare * (progressScale * .6 + (1 + (momentumScale - 1) * strength) * .4) : null,
    analog, boosted,
  }
  if (cut >= 24) for (const key of EXPERTS) values[key] = 0
  const result = { actual, observed, past, shape, complete, prior, seasonal, fraction, values, analogs, progressScale, momentumScale }
  cache?.set(key, result)
  return result
}

function combine(values, errors) {
  const available = EXPERTS.filter(key => values[key] !== null && Number.isFinite(values[key]))
  const weights = {}
  let total = 0
  for (const key of available) {
    const samples = errors.slice(-28).filter(row => row.values[key] !== null)
    const loss = samples.length >= 3 ? sum(samples.map(row => Math.abs(row.actual - row.values[key]))) / Math.max(1, sum(samples.map(row => row.dayTotal))) : null
    weights[key] = loss === null ? (key === 'profile' || key === 'momentum' ? 1 : .6) : 1 / (.03 + loss) ** 2
    // An untested boosted candidate never gets a default production weight.
    if (key === 'boosted' && loss === null) weights[key] = 0
    total += weights[key]
  }
  for (const key of available) weights[key] /= total || 1
  return { remaining: sum(available.map(key => values[key] * weights[key])), weights }
}

function rolling(days, client, cut, cache) {
  const errors = [], records = []
  const latest = days.at(-1)?.date
  for (const day of days.filter(row => row.totals[client] && !row.estimated && age(latest, row.date) <= 56)) {
    if (pastDays(days, client, day.date).length < 7) continue
    if (!day.complete[client]) continue
    const item = candidates(days, client, day.date, cut, false, cache)
    const actualTotal = sum(day.hours[client].map(row => row.tokens))
    const outcome = Math.max(0, actualTotal - item.actual)
    const combined = combine(item.values, errors)
    records.push({ date: day.date, actual: actualTotal, baseline: linearBaseline(item.past, client), total: item.actual + combined.remaining, error: outcome - combined.remaining,
      remainderError: outcome - combined.remaining, scale: Math.max(1, item.prior), observed: item.actual })
    errors.push({ values: item.values, actual: outcome, dayTotal: actualTotal })
  }
  return { errors, records }
}

/** Forecast a historical cutoff causally; used by both live calculation and reproducible evaluation. */
export function forecastAt(days, client, date, cut, options = {}) {
  const before = days.filter(day => day.date < date)
  const evaluated = rolling(before, client, cut, options.cache)
  const item = candidates(days, client, date, cut, options.live === true, options.cache)
  const combined = combine(item.values, evaluated.errors)
  const records = evaluated.records.slice(-28)
  const normalized = records.map(row => row.error / row.scale)
  const calibrated = records.filter(row => row.actual > 0).length >= 8 && item.complete.length >= 8
  const fallbackWidth = Math.max(item.prior * .65, combined.remaining * .65)
  const lowerError = calibrated ? Math.min(0, quantile(normalized, .1) * Math.max(1, item.prior)) : -fallbackWidth
  const upperError = calibrated ? Math.max(0, quantile(normalized, .9) * Math.max(1, item.prior)) : fallbackWidth
  const total = item.actual + combined.remaining
  const hours = item.shape.map((share, hour) => {
    const fraction = clamp(hour + 1 - cut, 0, 1)
    const remaining = (1 - item.fraction) > 1e-9 ? combined.remaining * share * fraction / (1 - item.fraction)
      : cut < 24 ? combined.remaining * fraction / (24 - cut) : 0
    return { hour, actual: hour <= Math.floor(cut) && cut > hour ? item.observed[hour].tokens : null, remaining }
  })
  const observedHours = item.observed.slice(0, Math.ceil(cut))
  const actualCalls = observedHours.every(row => row.calls !== null) ? sum(observedHours.map(row => row.calls)) : null
  const actualCost = observedHours.every(row => row.cost !== null) ? sum(observedHours.map(row => row.cost)) : null
  const recentDaily = item.past.slice(-14)
  const tokens = sum(recentDaily.map(row => row.totals[client].tokens))
  const unitCost = tokens > 0 ? sum(recentDaily.map(row => row.totals[client].cost)) / tokens : 0
  const unitCalls = tokens > 0 ? sum(recentDaily.map(row => row.totals[client].calls)) / tokens : 0
  const cache = observedHours.every(row => row.cacheTokens !== null) ? sum(observedHours.map(row => row.cacheTokens)) : null
  const last3 = observedWindow(item.observed, Math.max(0, cut - 3), cut, cut)
  const prev3 = observedWindow(item.observed, Math.max(0, cut - 6), Math.max(0, cut - 3), cut)
  return { actual: item.actual, remaining: combined.remaining, total, lower: Math.max(item.actual, total + lowerError), upper: Math.max(total, total + upperError),
    hours, prior: item.prior, sameTime: { expected: item.prior * item.fraction, ratio: item.prior * item.fraction > 0 ? item.actual / (item.prior * item.fraction) : null },
    weekday: { day: weekday(date), expected: item.seasonal, baseline: item.prior },
    activity: { activeHours: item.observed.filter(row => row.tokens > 0).length, elapsedHours: cut, last3, previous3: prev3, acceleration: prev3 > 0 ? last3 / prev3 - 1 : null },
    calls: { actual: actualCalls, total: (actualCalls ?? item.actual * unitCalls) + combined.remaining * unitCalls, tokensPerCall: actualCalls > 0 ? item.actual / actualCalls : null },
    cost: { actual: actualCost, total: (actualCost ?? item.actual * unitCost) + combined.remaining * unitCost, basis: 'API-equivalent USD', cacheRatio: item.actual > 0 && cache !== null ? cache / item.actual : null },
    analogs: item.analogs.slice(0, 5), models: Object.entries(combined.weights).map(([id, weight]) => ({ id, label: LABELS[id], weight, remaining: item.values[id] })),
    reliability: { hourlyDays: item.complete.length, dailyDays: item.past.length, calibrationDays: records.length, provisional: !calibrated,
      excludedDays: item.past.filter(day => !day.complete[client]).length },
    residuals: records.map(row => row.error / row.scale * Math.max(1, item.prior)),
    scenarios: [1, 3, 6].map(duration => ({ hours: duration, tokens: sum(hours.map(row => row.remaining * clamp((cut + duration - row.hour) / Math.max(.0001, row.hour + 1 - Math.max(row.hour, cut)), 0, 1))) })),
  }
}

/** Evaluate 08:00/12:00/16:00/20:00 estimates using only earlier completed days. */
export function evaluateForecasts(history, client, cache) {
  return { byHour: CUTS.map(hour => {
    const { records } = rolling(history.days, client, hour, cache)
    const chosen = records.slice(-28), actual = sum(chosen.map(row => row.actual))
    return { hour, samples: chosen.length, wape: actual > 0 ? sum(chosen.map(row => Math.abs(row.error))) / actual : null,
      baselineWape: actual > 0 ? sum(chosen.map(row => Math.abs(row.actual - row.baseline))) / actual : null,
      mae: chosen.length ? average(chosen.map(row => Math.abs(row.error))) : null,
      bias: actual > 0 ? sum(chosen.map(row => -row.error)) / actual : null }
  }) }
}

function addForecasts(rows) {
  const actual = sum(rows.map(row => row.actual)), total = sum(rows.map(row => row.total))
  return {
    actual, remaining: total - actual, total, lower: sum(rows.map(row => row.lower)), upper: sum(rows.map(row => row.upper)), prior: sum(rows.map(row => row.prior)),
    hours: Array.from({ length: 24 }, (_, i) => ({ hour: i, actual: rows.some(row => row.hours[i].actual !== null) ? sum(rows.map(row => row.hours[i].actual || 0)) : null, remaining: sum(rows.map(row => row.hours[i].remaining)) })),
    sameTime: { expected: sum(rows.map(row => row.sameTime.expected)), ratio: null }, weekday: { expected: sum(rows.map(row => row.weekday.expected)), baseline: sum(rows.map(row => row.prior)) },
    activity: { activeHours: 0, elapsedHours: rows[0]?.activity.elapsedHours || 0, last3: sum(rows.map(row => row.activity.last3)), previous3: sum(rows.map(row => row.activity.previous3)), acceleration: null },
    calls: { actual: rows.every(row => row.calls.actual !== null) ? sum(rows.map(row => row.calls.actual)) : null, total: sum(rows.map(row => row.calls.total)), tokensPerCall: null },
    cost: { actual: rows.every(row => row.cost.actual !== null) ? sum(rows.map(row => row.cost.actual)) : null, total: sum(rows.map(row => row.cost.total)), cacheRatio: rows.every(row => row.cost.cacheRatio !== null || row.actual === 0) && actual > 0 ? sum(rows.map(row => row.actual * (row.cost.cacheRatio || 0))) / actual : null },
    scenarios: [1, 3, 6].map((duration, i) => ({ hours: duration, tokens: sum(rows.map(row => row.scenarios[i].tokens)) })),
    models: [], analogs: [], residuals: [], reliability: { provisional: true, hourlyDays: 0, dailyDays: Math.max(0, ...rows.map(row => row.reliability.dailyDays)), calibrationDays: 0, excludedDays: Math.max(0, ...rows.map(row => row.reliability.excludedDays)) },
  }
}

/** Build one immutable all-platform and per-platform forecast snapshot for a live cutoff. */
export function buildForecast(history, options = {}) {
  const now = options.now ?? history.updatedAt
  const { date, hour } = forecastClock(now)
  const forecasts = {}
  const cache = new Map()
  for (const client of history.clients) {
    forecasts[client] = forecastAt(history.days, client, date, hour, { live: true, cache })
    forecasts[client].backtest = evaluateForecasts(history, client, cache)
  }
  const all = addForecasts(Object.values(forecasts))
  const common = history.days.filter(day => day.date < date && age(date, day.date) <= 56 && history.clients.every(client => day.complete[client]))
  const activeCommon = common.filter(day => history.clients.some(client => day.totals[client]?.tokens > 0))
  const aggregateErrors = []
  all.backtest = { byHour: CUTS.map(cut => {
    const records = []
    for (const day of common.slice(-28)) {
      if (history.days.filter(row => row.date < day.date).length < 7) continue
      const total = sum(history.clients.map(client => forecastAt(history.days, client, day.date, cut, { cache }).total))
      const actual = sum(history.clients.map(client => day.totals[client].tokens))
      const baseline = sum(history.clients.map(client => linearBaseline(pastDays(history.days, client, day.date), client)))
      records.push({ total, actual, baseline })
      if (cut === CUTS.reduce((a, b) => Math.abs(a - hour) < Math.abs(b - hour) ? a : b)) aggregateErrors.push(actual - total)
    }
    const actual = sum(records.map(row => row.actual))
    return { hour: cut, samples: records.length, wape: actual > 0 ? sum(records.map(row => Math.abs(row.actual - row.total))) / actual : null,
      baselineWape: actual > 0 ? sum(records.map(row => Math.abs(row.actual - row.baseline))) / actual : null,
      mae: records.length ? average(records.map(row => Math.abs(row.actual - row.total))) : null }
  }) }
  all.reliability = { ...all.reliability, hourlyDays: activeCommon.length, calibrationDays: aggregateErrors.length,
    provisional: activeCommon.length < 8 || aggregateErrors.length < 8 || Object.values(forecasts).some(row => row.total > 1 && row.reliability.provisional) }
  if (!all.reliability.provisional) {
    all.lower = Math.max(all.actual, all.total + Math.min(0, quantile(aggregateErrors, .1)))
    all.upper = all.total + Math.max(0, quantile(aggregateErrors, .9))
  }
  all.residuals = aggregateErrors
  all.sameTime.ratio = all.sameTime.expected > 0 ? all.actual / all.sameTime.expected : null
  all.activity.activeHours = all.hours.filter(row => row.actual > 0).length
  all.activity.acceleration = all.activity.previous3 > 0 ? all.activity.last3 / all.activity.previous3 - 1 : null
  all.calls.tokensPerCall = all.calls.actual > 0 ? all.actual / all.calls.actual : null
  const dominant = history.clients.toSorted((a, b) => forecasts[b].total - forecasts[a].total)[0]
  all.analogs = forecasts[dominant]?.analogs || []
  all.models = forecasts[dominant]?.models || []
  all.explanationPlatform = dominant
  forecasts.all = all
  return { version: 1, date, timeZone: TIME_ZONE, generatedAt: now, nextRefreshAt: now + 180000, clients: history.clients, forecasts }
}

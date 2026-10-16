/** Nonlinear direct hourly forecasts with causal temporal selection and observed-outcome comparisons. */
import { forecastClock, TIME_ZONE } from './forecast-history.js'
import { sum, mean, age, weekday, quantile, metric, clamp, contextFor, previousDate } from './forecast-context.js'
import { fitHourlyForest, forestHours } from './forecast-forest.js'
import { errorSummary, FORECAST_MODEL } from './forecast-accuracy.js'

const CUTS = [8, 12, 16, 20]
const EXPERTS = ['kernel', 'forest', 'seasonal']
const LABELS = { kernel: '小时轨迹核回归', forest: '多时距随机森林', seasonal: '季节核先验' }

function workspace(days) {
  return { days, forests: new Map(), candidates: new Map(), rolling: new Map() }
}

function modelFor(state, client, date) {
  const key = `${client}/${date}`
  if (!state.forests.has(key)) state.forests.set(key, fitHourlyForest(state.days, client, date))
  return state.forests.get(key)
}

function seasonalHours(context) {
  const rows = context.complete.slice(-28)
  const weights = rows.map(day => Math.exp(-age(context.date, day.date) / 10) * (weekday(context.date) === weekday(day.date) ? 2 : 1))
  const weight = sum(weights)
  return Array.from({ length: 24 }, (_, hour) => {
    if (hour < context.cut && hour !== Math.floor(context.cut)) return 0
    const full = weight > 0 ? sum(rows.map((day, index) => day.hours[context.client][hour].tokens * weights[index])) / weight : 0
    return hour === Math.floor(context.cut) ? Math.max(0, full - context.observed[hour].tokens) : full
  })
}

function trajectoryHours(context, days) {
  const { client, date, cut, observed, scale } = context
  if (!context.complete.length) return { hours: Array(24).fill(0), analogs: [] }
  const logRate = (tokens, level) => Math.log1p(tokens / Math.max(1, level) * 24)
  const similarities = context.complete.map(day => {
    const before = contextFor(days, client, day.date, cut)
    const referenceScale = Math.max(1, day.totals[client].tokens)
    let distance = .5 * Math.abs(logRate(before.actual, referenceScale) - logRate(context.actual, scale))
    for (const width of [1, 3, 6]) {
      const from = Math.max(0, cut - width)
      const left = metric(before.observed.slice(Math.floor(from), Math.ceil(cut)))
      const right = metric(observed.slice(Math.floor(from), Math.ceil(cut)))
      distance += Math.abs(logRate(left, referenceScale) - logRate(right, scale)) / 3
    }
    distance += Math.abs(before.quiet - context.quiet) / 6 + age(date, day.date) / 42
      + (weekday(date) === weekday(day.date) ? 0 : .15)
    return { day, referenceScale, distance }
  }).sort((a, b) => a.distance - b.distance).slice(0, 9)
  const bandwidth = Math.max(.25, quantile(similarities.map(row => row.distance), .5) || 1)
  const weights = similarities.map(row => Math.exp(-(row.distance - similarities[0].distance) / bandwidth))
  const weight = sum(weights)
  const hours = Array.from({ length: 24 }, (_, hour) => {
    if (hour < Math.floor(cut)) return 0
    const full = sum(similarities.map((row, index) => row.day.hours[client][hour].tokens / row.referenceScale * weights[index])) / weight * scale
    return hour === Math.floor(cut) ? Math.max(0, full - observed[hour].tokens) : full
  })
  return { hours, analogs: similarities.map(row => ({ date: row.day.date, score: row.distance, total: row.day.totals[client].tokens })) }
}

function candidates(state, client, date, cut, live = false) {
  const key = `${client}/${date}/${cut}`
  if (!live && state.candidates.has(key)) return state.candidates.get(key)
  const context = contextFor(state.days, client, date, cut, live)
  const kernel = trajectoryHours(context, state.days)
  const result = { context, analogs: kernel.analogs,
    values: { kernel: kernel.hours, forest: forestHours(modelFor(state, client, date), context), seasonal: seasonalHours(context) } }
  if (!live) state.candidates.set(key, result)
  return result
}

function combine(item, records) {
  const available = EXPERTS.filter(key => item.values[key] !== null)
  const weights = {}
  for (const key of available) {
    const evaluated = records.filter(row => row.candidates[key] !== null && (row.actual > 0 || row.candidates[key] > 0)).slice(-14)
    if (evaluated.length < 3) { weights[key] = key === 'kernel' ? .6 : key === 'forest' ? .25 : .15; continue }
    const losses = evaluated.map((row, index) => ({ weight: Math.exp((index - evaluated.length + 1) / 7),
      loss: Math.abs(row.actual - row.candidates[key]) / Math.max(1, row.actual, row.scale * .1) }))
    const loss = sum(losses.map(row => row.loss * row.weight)) / sum(losses.map(row => row.weight))
    weights[key] = Math.exp(-Math.min(10, loss) / .2)
  }
  const totalWeight = sum(Object.values(weights)) || 1
  for (const key of available) weights[key] /= totalWeight
  const hours = Array.from({ length: 24 }, (_, hour) => sum(available.map(key => item.values[key][hour] * weights[key])))
  return { hours, remaining: sum(hours), weights }
}

function rolling(state, client, cut, beforeDate) {
  const key = `${client}/${cut}/${beforeDate}`
  if (state.rolling.has(key)) return state.rolling.get(key)
  const records = []
  const days = state.days.filter(day => day.date < beforeDate && age(beforeDate, day.date) <= 56 && !day.estimated && day.complete[client]).slice(-28)
  for (const day of days) {
    const past = state.days.filter(row => row.date < day.date && row.totals[client] && !row.estimated)
    if (past.length < 7) continue
    const item = candidates(state, client, day.date, cut)
    const combined = combine(item, records)
    const actual = metric(day.hours[client])
    const total = item.context.actual + combined.remaining
    records.push({ date: day.date, actual, total, error: actual - total, scale: item.context.scale,
      candidates: Object.fromEntries(EXPERTS.map(name => [name, item.values[name] === null ? null : item.context.actual + sum(item.values[name])])) })
  }
  state.rolling.set(key, records)
  return records
}

function calibrate(row, records) {
  const positive = records.filter(item => item.actual > 0)
  const residuals = positive.map(item => item.error / Math.max(1, item.scale) * row.scale)
  const provisional = positive.length < 8 || row.reliability.hourlyDays < 8 || row.reliability.provisional === true
  const width = Math.max(row.remaining, row.prior) * .75
  row.lower = Math.max(row.actual, row.total + (provisional ? -width : Math.min(0, quantile(residuals, .1))))
  row.upper = row.total + (provisional ? width : Math.max(0, quantile(residuals, .9)))
  row.residuals = residuals
  row.reliability.calibrationDays = positive.length
  row.reliability.provisional = provisional
  return row
}

/** Forecast only from the observed prefix; target-day final totals never become input features. */
export function forecastAt(days, client, date, cut, options = {}) {
  const state = options.workspace || workspace(days)
  const item = candidates(state, client, date, cut, options.live === true)
  // Historical calibration stays on full-hour boundaries; no synthetic intra-hour observations.
  const records = rolling(state, client, Math.floor(cut), date)
  const combined = combine(item, records)
  const context = item.context
  const hours = combined.hours.map((remaining, hour) => ({ hour,
    actual: hour < cut ? context.observed[hour].tokens : null, remaining }))
  const observed = context.observed.slice(0, Math.ceil(cut))
  const known = name => observed.every(row => row[name] !== null)
  const actualCalls = known('calls') ? metric(observed, 'calls') : null
  const actualCost = known('cost') ? metric(observed, 'cost') : null
  const tokens = sum(context.past.slice(-14).map(day => day.totals[client].tokens))
  const unitCost = tokens > 0 ? sum(context.past.slice(-14).map(day => day.totals[client].cost || 0)) / tokens : 0
  const unitCalls = tokens > 0 ? sum(context.past.slice(-14).map(day => day.totals[client].calls || 0)) / tokens : 0
  const row = { actual: context.actual, remaining: combined.remaining, total: context.actual + combined.remaining,
    hours, prior: context.prior, scale: context.scale,
    sameTime: { expected: context.baseScale * context.fraction, ratio: context.baseScale * context.fraction > 0 ? context.actual / (context.baseScale * context.fraction) : null },
    weekday: { day: weekday(date), expected: context.prior, baseline: context.baseScale },
    activity: { activeHours: context.activeHours, elapsedHours: cut, last3: context.last3, previous3: context.previous3, acceleration: context.previous3 > 0 ? context.last3 / context.previous3 - 1 : null },
    calls: { actual: actualCalls, total: (actualCalls || 0) + combined.remaining * unitCalls, tokensPerCall: actualCalls > 0 ? context.actual / actualCalls : null },
    cost: { actual: actualCost, total: (actualCost || 0) + combined.remaining * unitCost, basis: 'API-equivalent USD', cacheRatio: known('cacheTokens') && context.actual > 0 ? metric(observed, 'cacheTokens') / context.actual : null },
    analogs: item.analogs.slice(0, 5), models: Object.entries(combined.weights).map(([id, weight]) => ({ id, label: LABELS[id], weight, remaining: sum(item.values[id]) })),
    reliability: { hourlyDays: context.complete.filter(day => day.totals[client].tokens > 0).length, dailyDays: context.past.length,
      excludedDays: context.past.filter(day => !day.complete[client]).length, hourlyAvailable: context.complete.length > 0 },
    scenarios: [1, 3, 6].map(duration => ({ hours: duration, tokens: sum(hours.map(hour => hour.remaining * clamp((cut + duration - hour.hour) / Math.max(.0001, hour.hour + 1 - Math.max(hour.hour, cut)), 0, 1))) })),
  }
  return calibrate(row, records)
}

/** Evaluate the four reference cutoffs with whole-day expanding temporal folds. */
export function evaluateForecasts(history, client, options = {}) {
  const state = options.workspace || workspace(history.days)
  const date = forecastClock(history.updatedAt).date
  return { byHour: CUTS.map(hour => {
    const records = rolling(state, client, hour, date)
    return { hour, ...errorSummary(records), mae: records.length ? mean(records.map(row => Math.abs(row.error))) : null }
  }) }
}

function comparisons(history, clients, date) {
  const read = day => day && !day.estimated && clients.every(client => day.complete[client])
    ? Array.from({ length: 24 }, (_, hour) => sum(clients.map(client => day.hours[client][hour].tokens))) : null
  const yesterdayDate = previousDate(date, 1)
  const yesterday = read(history.days.find(day => day.date === yesterdayDate))
  const week = Array.from({ length: 7 }, (_, index) => read(history.days.find(day => day.date === previousDate(date, index + 1)))).filter(Boolean)
  return { yesterday: { date: yesterdayDate, available: yesterday !== null, hours: yesterday || Array(24).fill(null) },
    week: { start: previousDate(date, 7), end: yesterdayDate, days: week.length,
      hours: week.length ? Array.from({ length: 24 }, (_, hour) => mean(week.map(day => day[hour]))) : Array(24).fill(null) } }
}

function aggregate(rows) {
  const actual = sum(rows.map(row => row.actual)), total = sum(rows.map(row => row.total))
  const remaining = total - actual
  return { actual, remaining, total, prior: sum(rows.map(row => row.prior)), scale: sum(rows.map(row => row.scale)),
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, actual: rows.some(row => row.hours[hour].actual !== null) ? sum(rows.map(row => row.hours[hour].actual || 0)) : null, remaining: sum(rows.map(row => row.hours[hour].remaining)) })),
    sameTime: { expected: sum(rows.map(row => row.sameTime.expected)) },
    activity: { elapsedHours: rows[0]?.activity.elapsedHours || 0, activeHours: 0, last3: sum(rows.map(row => row.activity.last3)), previous3: sum(rows.map(row => row.activity.previous3)) },
    calls: { actual: rows.every(row => row.calls.actual !== null) ? sum(rows.map(row => row.calls.actual)) : null, total: sum(rows.map(row => row.calls.total)) },
    cost: { actual: rows.every(row => row.cost.actual !== null) ? sum(rows.map(row => row.cost.actual)) : null, total: sum(rows.map(row => row.cost.total)),
      cacheRatio: actual > 0 && rows.every(row => row.cost.cacheRatio !== null || row.actual === 0) ? sum(rows.map(row => row.actual * (row.cost.cacheRatio || 0))) / actual : null },
    models: [], analogs: [], scenarios: [1, 3, 6].map((hours, index) => ({ hours, tokens: sum(rows.map(row => row.scenarios[index].tokens)) })),
    reliability: { hourlyDays: 0, dailyDays: Math.max(0, ...rows.map(row => row.reliability.dailyDays)), excludedDays: Math.max(0, ...rows.map(row => row.reliability.excludedDays)), hourlyAvailable: rows.every(row => row.total <= 1 || row.reliability.hourlyAvailable) } }
}

/** A memo belongs to one collector and compares full input content, never digests. */
export function buildForecast(history, options = {}) {
  const now = options.now ?? history.updatedAt
  const { date, hour } = forecastClock(now)
  const memo = options.memo || {}
  const pastContent = JSON.stringify(history.days.filter(day => day.date < date))
  if (memo.pastContent !== pastContent) { memo.pastContent = pastContent; memo.state = workspace(history.days) }
  const state = memo.state
  state.days = history.days
  const forecasts = {}
  for (const client of history.clients) {
    const row = forecastAt(history.days, client, date, hour, { live: true, workspace: state })
    row.backtest = evaluateForecasts(history, client, { workspace: state })
    row.comparisons = comparisons(history, [client], date)
    forecasts[client] = row
  }
  const all = aggregate(Object.values(forecasts))
  const common = history.days.filter(day => day.date < date && age(date, day.date) <= 56 && !day.estimated && history.clients.every(client => day.complete[client])).slice(-28)
  const aggregateRecords = cut => common.flatMap(day => {
    const records = history.clients.map(client => rolling(state, client, cut, date).find(row => row.date === day.date))
    if (records.some(row => !row)) return []
    const actual = sum(records.map(row => row.actual)), total = sum(records.map(row => row.total))
    return [{ date: day.date, actual, total, error: actual - total, scale: sum(records.map(row => row.scale)) }]
  })
  all.backtest = { byHour: CUTS.map(cut => ({ hour: cut, ...errorSummary(aggregateRecords(cut)) })) }
  all.reliability.hourlyDays = common.filter(day => history.clients.some(client => day.totals[client].tokens > 0)).length
  all.reliability.provisional = Object.values(forecasts).some(row => row.total > 1 && row.reliability.provisional)
  calibrate(all, aggregateRecords(Math.floor(hour)))
  all.comparisons = comparisons(history, history.clients, date)
  all.activity.activeHours = all.hours.filter(row => row.actual > 0).length
  all.sameTime.ratio = all.sameTime.expected > 0 ? all.actual / all.sameTime.expected : null
  forecasts.all = all
  return { version: 2, model: FORECAST_MODEL, date, cutoffHour: hour, timeZone: TIME_ZONE, generatedAt: now,
    nextRefreshAt: now + 180000, clients: history.clients, forecasts }
}

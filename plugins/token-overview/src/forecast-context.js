/** Past-only feature construction shared by nonlinear hourly predictors. */
export const sum = values => values.reduce((n, value) => n + value, 0)
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
export const mean = values => values.length ? sum(values) / values.length : 0
export const age = (date, before) => (Date.parse(date) - Date.parse(before)) / 86400000
export const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay()
export const metric = (hours, name = 'tokens') => sum(hours.map(row => row[name] || 0))
export const previousDate = (date, offset) => new Date(Date.parse(`${date}T00:00:00Z`) - offset * 86400000).toISOString().slice(0, 10)

export function quantile(values, q) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * (sorted.length + 1)) - 1))]
}

export function weightedMean(rows) {
  const weight = sum(rows.map(row => row.weight))
  return weight > 0 ? sum(rows.map(row => row.value * row.weight)) / weight : 0
}

export function dailyPrior(past, client, date) {
  const recent = past.filter(day => age(date, day.date) <= 28 && day.totals[client])
  return weightedMean(recent.map(day => ({ value: day.totals[client].tokens,
    weight: Math.exp(-age(date, day.date) / 10) * (weekday(date) === weekday(day.date) ? 2 : 1) })))
}

export function observedHours(day, client, cut, live) {
  const hours = day?.hours[client] || Array.from({ length: 24 }, () => ({ tokens: 0, calls: null, cost: null, cacheTokens: null, outputTokens: null }))
  return hours.map((row, hour) => {
    const fraction = live ? Number(hour < cut) : clamp(cut - hour, 0, 1)
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? null : value * fraction]))
  })
}

export function windowTokens(hours, start, end, cut) {
  return sum(hours.map((row, hour) => {
    const span = clamp(cut - hour, 0, 1)
    const overlap = Math.max(0, Math.min(hour + 1, cut, end) - Math.max(hour, start))
    return span > 0 ? row.tokens * overlap / span : 0
  }))
}

/** Build features without reading the target day's unobserved hours or final total. */
export function contextFor(days, client, date, cut, live = false) {
  const past = days.filter(day => day.date < date && !day.estimated && day.totals[client]).slice(-84)
  const complete = past.filter(day => day.complete[client] && age(date, day.date) <= 56)
  const observed = observedHours(days.find(day => day.date === date), client, cut, live)
  const actual = metric(observed)
  const prior = dailyPrior(past, client, date)
  const baseScale = Math.max(1, quantile(past.slice(-28).map(day => day.totals[client].tokens).filter(value => value > 0), .5) || prior)
  const recent = complete.slice(-28)
  const profile = Array.from({ length: 24 }, (_, hour) => weightedMean(recent.map(day => ({ value: day.hours[client][hour].tokens / Math.max(1, day.totals[client].tokens), weight: Math.exp(-age(date, day.date) / 14) }))))
  const fraction = sum(profile.map((value, hour) => value * clamp(cut - hour, 0, 1)))
  // A nonlinear level update adapts amplitude; each remaining hour is still predicted separately.
  const activeHours = observed.filter(row => row.tokens > 0).length
  const support = (1 - Math.exp(-activeHours / 3)) * Math.min(1, fraction / .2)
  const ratio = fraction > 0 ? actual / Math.max(1, baseScale * fraction) : 1
  const scale = baseScale * Math.exp(support * Math.log(clamp(ratio, .1, 20)))
  const last3 = windowTokens(observed, Math.max(0, cut - 3), cut, cut)
  const previous3 = windowTokens(observed, Math.max(0, cut - 6), Math.max(0, cut - 3), cut)
  let quiet = 0
  for (let hour = Math.floor(cut); hour >= 0; hour--) {
    const span = clamp(cut - hour, 0, 1)
    if (span === 0) continue
    if (observed[hour].tokens > 0) break
    quiet += span
  }
  return { past, complete, observed, actual, prior, baseScale, scale, profile, fraction, activeHours, cut, date, client, last3, previous3, quiet }
}

const normalized = (value, scale) => Math.log1p(Math.max(0, value) / Math.max(1, scale) * 24)

/** A horizon is a covariate, so inference never feeds predicted hours back into its own lags. */
export function horizonFeatures(context, hour) {
  const { observed, cut, date, client, scale, complete, past } = context
  const recent = complete.slice(-7)
  const yesterday = complete.find(day => day.date === previousDate(date, 1))
  const weekAgo = complete.find(day => day.date === previousDate(date, 7))
  const calls = metric(observed, 'calls')
  const tokens = context.actual
  const details = observed.slice(0, Math.ceil(cut))
  const known = name => details.length > 0 && details.every(row => row[name] !== null)
  const dayAngle = weekday(date) * Math.PI * 2 / 7
  const targetAngle = hour * Math.PI * 2 / 24
  return [cut / 24, (hour - cut) / 24, Math.sin(targetAngle), Math.cos(targetAngle), Math.sin(dayAngle), Math.cos(dayAngle),
    normalized(context.actual, scale), normalized(context.prior, scale), context.fraction, context.activeHours / Math.max(1, cut), context.quiet / 24,
    ...[1, 2, 3, 6].map(width => normalized(windowTokens(observed, Math.max(0, cut - width), cut, cut) / Math.min(width, Math.max(.05, cut)), scale)),
    ...[0, 1, 2, 3].map(block => normalized(windowTokens(observed, Math.max(0, cut - (block + 1) * 3), Math.max(0, cut - block * 3), cut), scale)),
    normalized(yesterday?.hours[client][hour].tokens || 0, scale), Number(Boolean(yesterday)),
    normalized(weekAgo?.hours[client][hour].tokens || 0, scale), Number(Boolean(weekAgo)),
    normalized(mean(recent.map(day => day.hours[client][hour].tokens)), scale),
    recent.length ? recent.filter(day => day.hours[client][hour].tokens > 0).length / recent.length : 0,
    normalized(mean(past.slice(-7).map(day => day.totals[client].tokens)), scale),
    known('calls') ? Math.log1p(calls / Math.max(1, cut)) : 0, Number(known('calls')),
    calls > 0 ? Math.log1p(tokens / calls) : 0,
    known('cacheTokens') && tokens > 0 ? metric(observed, 'cacheTokens') / tokens : 0, Number(known('cacheTokens')),
    known('outputTokens') && tokens > 0 ? metric(observed, 'outputTokens') / tokens : 0, Number(known('outputTokens')),
  ]
}

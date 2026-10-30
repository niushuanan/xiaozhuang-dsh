import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeForecastHistory } from '../src/forecast-history.js'
import { buildForecast, forecastAt, evaluateForecasts } from '../src/forecast.js'

const clients = ['codex', 'dsh']
function fixture(count = 45) {
  const start = Date.parse('2026-08-01T00:00:00+08:00')
  const days = Array.from({ length: count }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10))
  const cells = days.map((_, i) => Array.from({ length: 24 }, (_, h) => [h >= 8 && h < 20 ? 100 + i : 0, h >= 10 && h < 18 ? 20 : 0, 2, .01]))
  const data = { days, dailyClients: Object.fromEntries(clients.map((c, ci) => [c, { processedTokens: cells.map(day => day.reduce((n, row) => n + row[ci], 0)), calls: cells.map(() => 48), cost: cells.map(() => .24) }])) }
  const now = Date.parse(`${days.at(-1)}T12:30:00+08:00`)
  cells.at(-1).forEach((row, h) => { if (h > 12) row.fill(0); else if (h === 12) { row[0] /= 2; row[1] /= 2 } })
  return { hourly: { meta: { clients, generatedAt: new Date(now).toISOString() }, days, cells }, data, now }
}

test('retains observed hourly usage when raw logs disappear and excludes incomplete history', () => {
  const f = fixture()
  f.hourly.cells[1][12][0] = 0
  const history = mergeForecastHistory(null, f.hourly, f.data, f.now)
  assert.equal(history.days[1].complete.codex, false)
  assert.equal(history.days[1].complete.dsh, true)
  assert.equal(history.days[0].complete.codex, true)
  const shrunk = structuredClone(f.hourly)
  shrunk.cells[0].forEach(row => row.fill(0))
  const next = mergeForecastHistory(history, shrunk, f.data, f.now + 180000)
  assert.deepEqual(next.days[0].hours.codex, history.days[0].hours.codex)
  assert.equal(next.days[0].complete.codex, true)
})

test('a reconciled closed-day scan corrects inflated earlier hours and restores yesterday comparisons', () => {
  const f = fixture(8)
  const previous = mergeForecastHistory(null, f.hourly, f.data, f.now)
  const yesterday = previous.days.at(-2)
  yesterday.hours.codex[9].tokens += 500
  yesterday.hours.codex[9].calls = 999
  yesterday.complete.codex = false
  const repaired = mergeForecastHistory(previous, f.hourly, f.data, f.now + 180000)
  const closed = repaired.days.at(-2)
  assert.equal(closed.hours.codex[9].tokens, 106)
  assert.equal(closed.hours.codex[9].calls, null)
  assert.equal(closed.complete.codex, true)
  const comparisons = buildForecast(repaired, { now: f.now }).forecasts.all.comparisons
  assert.equal(comparisons.yesterday.available, true)
  assert.equal(comparisons.yesterday.hours[9], 106)
  assert.equal(comparisons.yesterday.hours.reduce((total, value) => total + value, 0), 1432)
  assert.equal(comparisons.week.days, 7)
  assert.equal(yesterday.hours.codex[9].tokens, 606)
})

test('predicts remaining hours, reconciles platforms and respects partial-hour observation', () => {
  const f = fixture()
  const history = mergeForecastHistory(null, f.hourly, f.data, f.now)
  const result = buildForecast(history, { now: f.now })
  const all = result.forecasts.all
  assert.equal(all.actual, 4.5 * 144 + 2.5 * 20)
  assert.ok(all.total >= all.actual)
  assert.ok(all.lower >= all.actual && all.lower <= all.total && all.upper >= all.total)
  assert.equal(all.hours.length, 24)
  assert.equal(all.hours[13].actual, null)
  assert.equal(all.hours[11].remaining, 0)
  assert.ok(Math.abs(all.hours.reduce((n, h) => n + h.remaining, 0) - all.remaining) < .001)
  assert.equal(all.total, clients.reduce((n, c) => n + result.forecasts[c].total, 0))
  assert.ok(result.forecasts.codex.total > result.forecasts.dsh.total)
  assert.ok(all.backtest.byHour.some(row => row.hour === 8 && row.samples > 0))
  assert.ok(all.sameTime.expected >= 0)
  assert.equal(result.forecasts.codex.activity.last3, 3 * 144)
  assert.equal(result.forecasts.codex.activity.previous3, 1.5 * 144)
})

test('rolling evaluation uses only past days and never trains on the target remainder', () => {
  const f = fixture()
  const history = mergeForecastHistory(null, f.hourly, f.data, f.now)
  const target = history.days[35]
  const before = forecastAt(history.days, 'codex', target.date, 8)
  history.days[35].hours.codex[23].tokens = 1000000000
  history.days[40].totals.codex.tokens = 1000000000
  const after = forecastAt(history.days, 'codex', target.date, 8)
  assert.equal(before.total, after.total)
  const report = evaluateForecasts(history, 'codex')
  assert.ok(report.byHour.some(row => row.samples > 0))
  assert.ok(report.byHour.every(row => row.wape === null || Number.isFinite(row.wape)))
})

test('cold hourly history is explicitly provisional and missing values never become measured zero', () => {
  const f = fixture(8)
  f.hourly.cells.slice(0, -1).forEach(day => day.forEach(row => { row[0] = 0; row[1] = 0 }))
  const result = buildForecast(mergeForecastHistory(null, f.hourly, f.data, f.now), { now: f.now })
  assert.equal(result.forecasts.all.reliability.provisional, true)
  assert.equal(result.forecasts.all.reliability.hourlyDays, 0)
  assert.equal(result.forecasts.all.backtest.byHour[0].samples, 0)
  assert.equal(result.forecasts.all.backtest.byHour[0].wape, null)
  assert.ok(result.forecasts.all.total >= result.forecasts.all.actual)
})

test('live call, cost and cache metrics use only elapsed hours', () => {
  const f = fixture(8)
  f.hourly.clientMetrics = Object.fromEntries(clients.map(client => [client, f.hourly.days.map(() => Array.from({ length: 24 }, (_, hour) => hour < 13 ? [2, .5, 10, 5, 100, 0] : [0, 0, 0, 0, 0, 0]))]))
  const result = buildForecast(mergeForecastHistory(null, f.hourly, f.data, f.now), { now: f.now })
  assert.equal(result.forecasts.codex.calls.actual, 26)
  assert.equal(result.forecasts.codex.cost.actual, 6.5)
  assert.ok(result.forecasts.codex.cost.cacheRatio !== null)
})

test('midnight does not certify a partial day until yesterday is actually scanned closed', () => {
  const f = fixture(8)
  f.data.dailyClients.codex.processedTokens[f.data.days.length - 1] = f.hourly.cells.at(-1).reduce((n, h) => n + h[0], 0)
  const previous = mergeForecastHistory(null, f.hourly, f.data, f.now)
  const yesterday = previous.days.at(-1).date
  const tomorrow = new Date(Date.parse(`${yesterday}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
  const partial = previous.days.at(-1).hours.codex.reduce((n, h) => n + h.tokens, 0)
  f.data.dailyClients.codex.processedTokens[f.data.days.length - 1] = partial
  const now = Date.parse(`${tomorrow}T00:02:00+08:00`)
  const todayOnly = { meta: { clients }, days: [tomorrow], cells: [Array.from({ length: 24 }, () => [0, 0, 0, 0])] }
  const next = mergeForecastHistory(previous, todayOnly, f.data, now)
  assert.equal(next.days.find(day => day.date === yesterday).complete.codex, false)
  const closed = mergeForecastHistory(next, { ...f.hourly, meta: { clients }, days: f.hourly.days }, f.data, now)
  assert.equal(closed.days.find(day => day.date === yesterday).complete.codex, true)
})

test('idle historical days do not certify a sparsely observed platform forecast', () => {
  const f = fixture(22)
  for (let i = 0; i < 15; i++) {
    f.hourly.cells[i].forEach(row => { row[0] = 0; row[1] = 0 })
    for (const client of clients) f.data.dailyClients[client].processedTokens[i] = 0
  }
  const result = buildForecast(mergeForecastHistory(null, f.hourly, f.data, f.now), { now: f.now })
  assert.equal(result.forecasts.all.reliability.provisional, true)
  assert.equal(result.forecasts.all.reliability.hourlyDays, 6)
})

test('an isolated old activity day cannot supply a unit-scale label after a long idle period', () => {
  const f = fixture(84)
  f.hourly.days = f.data.days = Array.from({ length: 84 }, (_, i) => new Date(Date.UTC(2026, 7, 8 + i)).toISOString().slice(0, 10))
  f.now = Date.parse('2026-10-30T10:17:00+08:00')
  f.hourly.cells.forEach(day => day.forEach(row => row.fill(0)))
  for (const client of clients) f.data.dailyClients[client].processedTokens.fill(0)
  for (const [index, hour, tokens] of [[20, 0, 110105], [73, 11, 346395], [76, 10, 845369], [82, 9, 64203], [82, 15, 31823]]) {
    f.hourly.cells[index][hour][0] = tokens
    f.data.dailyClients.codex.processedTokens[index] += tokens
  }
  const history = mergeForecastHistory(null, f.hourly, f.data, f.now)
  const row = forecastAt(history.days, 'codex', history.days.at(-1).date, 10, { live: true })
  assert.equal(row.actual, 0)
  assert.ok(row.total < 1_000_000, `expected a forecast on the observed scale, got ${row.total}`)
})

test('a remainder after a historically quiet cutoff still reconciles with future hour buckets', () => {
  const f = fixture(22)
  f.hourly.cells.forEach((day, index) => {
    day.forEach(row => row.fill(0))
    day[9][0] = index === 21 ? 10 : 100
    f.data.dailyClients.codex.processedTokens[index] = day[9][0]
    f.data.dailyClients.dsh.processedTokens[index] = 0
  })
  const row = buildForecast(mergeForecastHistory(null, f.hourly, f.data, f.now), { now: f.now }).forecasts.codex
  assert.ok(row.remaining >= 0)
  assert.ok(Math.abs(row.hours.reduce((n, h) => n + h.remaining, 0) - row.remaining) < .00001)
  assert.ok(row.scenarios[0].tokens >= 0)
})

test('exceeding a daily prior does not cancel the expected workload of remaining active hours', () => {
  const f = fixture(30)
  for (const day of f.hourly.cells) day.forEach(row => { row[0] = 100; row[1] = 0 })
  f.data.dailyClients.codex.processedTokens.fill(2400)
  f.data.dailyClients.dsh.processedTokens.fill(0)
  f.hourly.cells.at(-1).forEach((row, hour) => { row[0] = hour < 12 ? 1000 : hour === 12 ? 500 : 0 })
  const row = buildForecast(mergeForecastHistory(null, f.hourly, f.data, f.now), { now: f.now }).forecasts.codex
  const daily = row.models.filter(model => ['recent', 'linear', 'weekday'].includes(model.id))
  assert.ok(row.actual > row.prior)
  assert.ok(daily.every(model => model.remaining > 1000))
  assert.ok(row.remaining > 1000)
})

/** Reproduce causal intraday errors from one local report directory; prints aggregate metrics only. */
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { buildForecast } from '../src/forecast.js'
import { mergeForecastHistory, reportTimestamp } from '../src/forecast-history.js'

const directory = resolve(process.argv[2] || '.')
const [data, runtime, raw] = await Promise.all([
  readFile(join(directory, 'dashboard.data.json'), 'utf8').then(JSON.parse),
  readFile(join(directory, 'runtime.json'), 'utf8').then(JSON.parse),
  readFile(join(directory, 'hourly.range.js'), 'utf8'),
])
const hourly = JSON.parse(raw.slice(raw.indexOf('=') + 1).trim().replace(/;$/, ''))
const now = reportTimestamp(hourly.meta.generatedAt)
data.estimatedDates = (runtime.history?.builtinRecoveries || []).flatMap(row => row.estimatedDates || [])
const history = mergeForecastHistory(null, hourly, data, now)
const report = buildForecast(history, { now })
console.log(JSON.stringify({ asOf: new Date(now).toISOString(), timeZone: report.timeZone,
  scopes: Object.fromEntries(Object.entries(report.forecasts).map(([client, row]) => [client, { reliability: row.reliability, backtest: row.backtest }])),
}, null, 2))

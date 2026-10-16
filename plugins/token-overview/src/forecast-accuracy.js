/** Outcomes of predictions actually issued before a day ended, separate from retrospective evaluation. */
import { age, mean, sum } from './forecast-context.js'

export const FORECAST_MODEL = 'bounded-forest-kernel-v3'
export const ERROR_TARGET = .1

export function errorSummary(records) {
  const positive = records.filter(row => row.actual > 0)
  const actual = sum(positive.map(row => row.actual))
  return { samples: positive.length, zeroDays: records.length - positive.length,
    wape: actual > 0 ? sum(positive.map(row => Math.abs(row.actual - row.total))) / actual : null,
    mape: positive.length ? mean(positive.map(row => Math.abs(row.actual - row.total) / row.actual)) : null,
    withinTarget: positive.filter(row => Math.abs(row.actual - row.total) / row.actual <= ERROR_TARGET).length,
    maxError: positive.length ? Math.max(...positive.map(row => Math.abs(row.actual - row.total) / row.actual)) : null,
    target: ERROR_TARGET }
}

/** Retain the first issued snapshot in each hour; settle only against closed, non-estimated daily totals. */
export function recordForecastAccuracy(previous, forecast, history) {
  const ledger = { version: 1, days: structuredClone(previous?.days || []).filter(day => age(forecast.date, day.date) <= 56) }
  for (const day of ledger.days) {
    if (day.date >= forecast.date) continue
    const outcome = history.days.find(row => row.date === day.date)
    if (!outcome || outcome.estimated) continue
    const actual = Object.fromEntries(history.clients.filter(client => outcome.complete[client] && outcome.totals[client]).map(client => [client, outcome.totals[client].tokens]))
    if (history.clients.every(client => outcome.complete[client] && outcome.totals[client])) actual.all = sum(Object.values(actual))
    day.actual = actual
  }
  let today = ledger.days.find(day => day.date === forecast.date)
  if (!today) { today = { date: forecast.date, issued: [] }; ledger.days.push(today) }
  const hour = Math.min(23, Math.floor(forecast.cutoffHour))
  if (!today.issued.some(row => row.hour === hour && row.model === FORECAST_MODEL)) {
    today.issued.push({ hour, cutoffHour: forecast.cutoffHour, generatedAt: forecast.generatedAt, issuedAt: forecast.calculatedAt || forecast.generatedAt, model: FORECAST_MODEL,
      totals: Object.fromEntries(Object.entries(forecast.forecasts).map(([client, row]) => [client, row.total])) })
  }
  const summary = {}
  for (const client of Object.keys(forecast.forecasts)) {
    summary[client] = { model: FORECAST_MODEL, target: ERROR_TARGET, byHour: Array.from({ length: 24 }, (_, cut) => {
      const records = []
      for (const day of ledger.days) {
        if (day.actual?.[client] === undefined) continue
        const issued = day.issued.find(row => row.hour === cut && row.model === FORECAST_MODEL)
        if (issued?.totals[client] !== undefined) records.push({ actual: day.actual[client], total: issued.totals[client] })
      }
      return { hour: cut, ...errorSummary(records) }
    }) }
  }
  return { ledger, summary }
}

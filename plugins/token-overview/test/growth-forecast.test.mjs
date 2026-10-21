import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGrowthForecast } from '../src/growth-forecast.js'

const days = Array.from({ length: 196 }, (_, index) => new Date(Date.UTC(2026, 3, 9 + index)).toISOString().slice(0, 10))

test('projects the next calendar month from the actual cumulative amount with ordered uncertainty', () => {
  const values = days.map((_, i) => 100 + i * 3)
  const forecast = buildGrowthForecast({ days, values, through: days.at(-1) })
  assert.equal(forecast.through, '2026-11-21')
  assert.equal(forecast.observed, values.reduce((a, b) => a + b, 0))
  assert.equal(forecast.daily.length, 31)
  assert.ok(forecast.additional > 20000)
  assert.ok(forecast.backtest.folds >= 5)
  assert.ok(forecast.backtest.wape < .1)
  assert.ok(forecast.backtest.wape < forecast.backtest.baselineWape)
  let previous = forecast.observed
  for (const row of forecast.daily) {
    assert.ok(row.cumulative >= previous)
    assert.ok(row.lower <= row.cumulative && row.cumulative <= row.upper)
    previous = row.cumulative
  }
})

test('retains weekly usage patterns and never trains on future records', () => {
  const values = days.map(day => [10, 100, 100, 100, 100, 100, 10][new Date(day + 'T00:00:00Z').getUTCDay()])
  const before = buildGrowthForecast({ days, values, through: days[160] })
  const changed = buildGrowthForecast({ days, values: values.map((v, i) => i > 160 ? 1e12 : v), through: days[160] })
  assert.deepEqual(before, changed)
  const forecast = buildGrowthForecast({ days, values, through: days.at(-1) })
  const weekday = forecast.daily.find(row => new Date(row.date + 'T00:00:00Z').getUTCDay() === 1)
  const weekend = forecast.daily.find(row => new Date(row.date + 'T00:00:00Z').getUTCDay() === 0)
  assert.ok(weekday.value > weekend.value * 3)
})

test('keeps partial and estimated observations out of model training while retaining actual totals', () => {
  const values = days.map(() => 100)
  values[180] = 1e7
  values[195] = 10
  const forecast = buildGrowthForecast({ days, values, through: days.at(-1), currentDate: days.at(-1), estimatedDates: [days[180]] })
  assert.equal(forecast.observed, values.reduce((a, b) => a + b, 0))
  assert.ok(forecast.additional > 3000 && forecast.additional < 3500)
  assert.equal(forecast.trainingDays, 194)
  assert.ok(forecast.remainingToday > 50)
})

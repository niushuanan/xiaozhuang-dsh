import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

test('daily forecast renders daily totals, hourly chart and collapsed uncertainty', async () => {
  const source = await readFile(new URL('../assets/forecast.js', import.meta.url), 'utf8')
  const root = { innerHTML: '', querySelector: () => null }
  const window = { addEventListener() {} }
  runInNewContext(source, { window, document: { getElementById: () => root }, Intl, Date, setInterval: () => 1, clearInterval() {}, fetch() {} })
  const row = { total: 1000, actual: 400, remaining: 600, lower: 700, upper: 1400, prior: 800,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, actual: hour < 8 ? 50 : null, remaining: hour >= 8 ? 37.5 : 0 })),
    reliability: { provisional: true, hourlyDays: 6, dailyDays: 80, excludedDays: 74, calibrationDays: 6 },
    backtest: { byHour: [{ hour: 8, samples: 6, wape: .2, mae: 100 }] }, revision: null }
  window.TokenDailyForecast.render({ date: '2026-10-15', generatedAt: 1792022400000, clients: ['codex'], forecasts: { all: row, codex: row } })
  assert.match(root.innerHTML, /今日预计|全天预计/)
  assert.match(root.innerHTML, /预测范围/)
  assert.match(root.innerHTML, /小时记录不足|暂定|样本/)
  assert.match(root.innerHTML, /dailyForecastChart/)
  assert.match(root.innerHTML, /今日已用|预计剩余/)
  assert.doesNotMatch(root.innerHTML, /NaN|undefined|Infinity/)
})

test('a new report day advances date bounds while preserving a selected historical start', async () => {
  const page = await readFile(new URL('../assets/report.html', import.meta.url), 'utf8')
  const source = page.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  const fields = Object.fromEntries(['startDate', 'endDate', 'notice'].map(id => [id, { max: '2026-10-15', classList: { toggle() {} } }]))
  const result = await runInNewContext(source + `\nrenderAll = () => {}; state.start = '2026-10-01'; state.end = '2026-10-15';
    (async () => { await refreshReportData(); return { start: state.start, end: state.end }; })();`, {
    window: { __TOKSCALE_DATA__: { days: ['2026-10-01', '2026-10-15'] }, addEventListener() {} },
    document: { getElementById: id => fields[id], querySelector: () => null },
    setInterval: () => 1, clearInterval() {}, Intl, Date,
    fetch: async () => ({ ok: true, json: async () => ({ generatedAt: 2, data: { days: ['2026-10-01', '2026-10-15', '2026-10-16'], meta: { report: {} } }, hourly: {} }) }),
  })
  assert.equal(result.start, '2026-10-01')
  assert.equal(result.end, '2026-10-16')
  assert.equal(fields.startDate.max, '2026-10-16')
  assert.equal(fields.endDate.max, '2026-10-16')
})

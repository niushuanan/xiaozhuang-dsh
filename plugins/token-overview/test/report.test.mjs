import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

test('momentum uses the selected period count for its average and growth rate', async () => {
  const page = await readFile(new URL('../assets/report.html', import.meta.url), 'utf8')
  const source = page.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  const days = Array.from({ length: 31 }, (_, i) => new Date(Date.UTC(2026, 9, i + 1)).toISOString().slice(0, 10))
  for (const { periods, average, rate } of [
    { periods: 1, average: 31, rate: 100 / 30 },
    { periods: 7, average: 28, rate: 100 / 27 },
    { periods: 30, average: 16.5, rate: 100 / 15.5 },
  ]) {
    const fields = {}
    const result = runInNewContext(source + `
      state.start = DATA.days[0]; state.end = DATA.days.at(-1); state.momentumWindow = ${periods};
      let chart; drawChart = (name, config) => { chart = config; };
      renderMomentum(activeIndices()); chart;`, {
      window: { __TOKSCALE_DATA__: { days, dailyTotals: { processedTokens: days.map((_, i) => i + 1) } }, addEventListener() {} },
      document: { getElementById: id => fields[id] ||= { classList: { toggle() {} } }, querySelector: () => null },
      setInterval: () => 1, clearInterval() {}, Intl, Date,
    })
    assert.equal(result.data.datasets[1].data.at(-1), average, `${periods}-period mean`)
    assert.equal(result.data.datasets[1].data.filter(value => value !== null).length, 32 - periods)
    assert.ok(Math.abs(result.data.datasets[2].data.at(-1) - rate) < 1e-10, `${periods}-period growth`)
    assert.equal(result.data.datasets[1].label, `${periods} 期移动平均`)
    assert.match(fields.momentumCaption.textContent, new RegExp(`${periods} 期均线`))
  }
})

test('momentum explains when the selected window has too few periods', async () => {
  const page = await readFile(new URL('../assets/report.html', import.meta.url), 'utf8')
  const source = page.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  const fields = {}
  const result = runInNewContext(source + `
    state.start = DATA.days[0]; state.end = DATA.days.at(-1); state.momentumWindow = 30;
    let chart; drawChart = (name, config) => { chart = config; };
    renderMomentum(activeIndices()); chart;`, {
    window: { __TOKSCALE_DATA__: { days: ['2026-10-01', '2026-10-02'], dailyTotals: { processedTokens: [10, 20] } }, addEventListener() {} },
    document: { getElementById: id => fields[id] ||= { classList: { toggle() {} } }, querySelector: () => null },
    setInterval: () => 1, clearInterval() {}, Intl, Date,
  })
  assert.deepEqual(Array.from(result.data.datasets[1].data), [null, null])
  assert.match(fields.momentumCaption.textContent, /不足 30 期/)
  assert.doesNotMatch(fields.momentumCaption.textContent, /均线 0/)
})

test('cumulative growth continues one month with a separate forecast and uncertainty band', async () => {
  const page = await readFile(new URL('../assets/report.html', import.meta.url), 'utf8')
  const source = page.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  const days = Array.from({ length: 100 }, (_, i) => new Date(Date.UTC(2026, 5, i + 1)).toISOString().slice(0, 10))
  const fields = {}
  const captured = runInNewContext(source + `
    state.start = DATA.days[0]; state.end = DATA.days.at(-1);
    renderJourney = () => {}; milestoneAnnotations = () => ({});
    let chart; drawChart = (name, config) => { chart = config; }; caption = () => {};
    renderCumulative(activeIndices()); chart;`, {
    window: { __TOKSCALE_DATA__: { days, dailyTotals: { processedTokens: days.map((_, i) => 100 + i) } }, addEventListener() {} },
    document: { getElementById: id => fields[id] ||= { classList: { toggle() {} } }, querySelector: () => null },
    setInterval: () => 1, clearInterval() {}, Intl, Date,
  })
  assert.ok(captured.data.labels.at(-1) > days.at(-1))
  const predicted = captured.data.datasets.find(row => row.label === '未来一个月预测')
  assert.ok(predicted.borderDash.length)
  assert.equal(predicted.data[days.length - 1], 14950)
  assert.ok(captured.data.datasets.some(row => row.label === '80% 预测范围'))
})

test('model chart combines the same model across platforms without losing tokens or cost', async () => {
  const page = await readFile(new URL('../assets/report.html', import.meta.url), 'utf8')
  const source = page.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
  const data = {
    days: ['2026-10-20'],
    modelCatalog: [
      { label: 'codex/deepseek-flash', client: 'codex', model: 'deepseek-flash', vendor: 'DeepSeek' },
      { label: 'zcode/DeepSeek_Flash', client: 'zcode', model: 'DeepSeek_Flash', vendor: 'DeepSeek' },
      { label: 'dsh/DeepSeek-V4-Pro', client: 'dsh', model: 'DeepSeek-V4-Pro', vendor: 'DeepSeek' },
    ],
    dailyModels: {
      'codex/deepseek-flash': { processedTokens: [100], cost: [1] },
      'zcode/DeepSeek_Flash': { processedTokens: [200], cost: [2] },
      'dsh/DeepSeek-V4-Pro': { processedTokens: [50], cost: [3] },
    },
  }
  const result = runInNewContext(source + `\nstate.start = state.end = '2026-10-20';
    const tokens = modelStackSeries([0], 'processedTokens');
    const cost = modelStackSeries([0], 'cost');
    ({ labels: tokens.series.map(row => row.label), tokens: tokens.series.map(row => tokens.seriesOf(row.id, 0)),
       cost: cost.series.reduce((sum, row) => sum + cost.seriesOf(row.id, 0), 0) });`, {
    window: { __TOKSCALE_DATA__: data, addEventListener() {} },
    document: { getElementById: () => ({ classList: { toggle() {} } }), querySelector: () => null },
    setInterval: () => 1, clearInterval() {}, Intl, Date,
  })
  assert.deepEqual(Array.from(result.labels), ['deepseek-flash', 'deepseek-v4-pro'])
  assert.deepEqual(Array.from(result.tokens), [300, 50])
  assert.equal(result.cost, 6)
})

test('daily forecast renders daily totals, hourly chart and collapsed uncertainty', async () => {
  const source = await readFile(new URL('../assets/forecast.js', import.meta.url), 'utf8')
  const root = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] }
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

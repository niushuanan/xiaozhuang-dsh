import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCollector, FORECAST_INTERVAL_MS } from '../src/index.js'

test('report reads retain closed-day hours without inventing missing hours or replacing live today', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-hourly-report-'))
  const directory = join(root, 'a')
  const days = ['2026-10-27', '2026-10-28', '2026-10-29']
  const hourly = { meta: { clients: ['codex'], generatedAt: '2026-10-29T00:05:00+08:00' }, days,
    cells: days.map((_, i) => Array.from({ length: 24 }, (_, hour) => [hour === 4 ? [0, 700, 100][i] : 0, 0, 0])) }
  const history = { version: 1, clients: ['codex'], days: days.map((date, i) => ({ date,
    hours: { codex: Array.from({ length: 24 }, (_, hour) => ({ tokens: hour === 4 ? [500, 600, 200][i] : 0, calls: 1, cost: .1 })) } })) }
  const graph = { meta: { dateRange: { start: days[0], end: days.at(-1) } }, summary: {}, contributions: [] }
  const collector = createCollector({ artifactRoot: root })
  try {
    await mkdir(directory)
    const runtime = { generatedAt: new Date().toISOString() }
    const data = { days, dailyTotals: { processedTokens: [1000, 1000, 1000] } }
    for (const [name, value] of Object.entries({ 'runtime.json': runtime, 'dashboard.data.json': data, 'hourly.today.json': {},
      'graph.today.json': graph, 'graph.week.json': graph, 'graph.month.json': graph, 'graph.all.json': graph })) {
      await writeFile(join(directory, name), JSON.stringify(value))
    }
    for (const name of ['report.html', 'data.js', 'chart.umd.min.js']) await writeFile(join(directory, name), '')
    await writeFile(join(directory, 'hourly.range.js'), `window.__TOKSCALE_HOURLY__=${JSON.stringify(hourly)};`)
    await writeFile(join(root, 'hourly-history.json'), JSON.stringify(history))
    await writeFile(join(root, 'active.json'), JSON.stringify({ slot: 'a', generatedAt: Date.now() }))
    await collector.start()
    const report = await collector.reportData()
    assert.deepEqual(report.hourly.cells.map(day => day[4][0]), [500, 700, 100])
    assert.equal(report.hourly.cells[0][5][0], 0)
    assert.equal(report.data.dailyTotals.processedTokens[0], 1000)
    const repeated = await collector.reportData()
    assert.equal(repeated.hourly.cells[0][4][0], 500)
    assert.deepEqual(hourly.cells.map(day => day[4][0]), [0, 700, 100])
  } finally {
    await collector.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('publishes a durable live forecast and preserves it when a later hourly scan fails', async () => {
  assert.equal(FORECAST_INTERVAL_MS, 180000)
  const root = await mkdtemp(join(tmpdir(), 'dsh-intraday-'))
  const runner = join(root, 'collector.mjs')
  const script = `import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
const args=process.argv.slice(2), root=${JSON.stringify(root)};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(args[0]==='hourly') {
 try {await readFile(join(root,'fail')); process.exit(2)} catch(e) {if(e.code!=='ENOENT') throw e}
 console.log(JSON.stringify({entries:[{hour:today+' 00:00',input:100,output:20,cacheRead:880,cacheWrite:0,messageCount:2,cost:1}]}));
} else {
 const dir=args[args.indexOf('--out-dir')+1];
 const clients=['codex','claude','opencode','workbuddy','zcode','dsh'];
 const data={days:[today],dailyClients:Object.fromEntries(clients.map(c=>[c,{processedTokens:[1000],calls:[2],cost:[1]}]))};
 const graph={meta:{dateRange:{start:today,end:today}},summary:{processedTokens:5000},contributions:[]};
 const runtime={generatedAt:new Date().toISOString(),runtime:{command:[process.execPath,${JSON.stringify(runner)}]},initialRange:{start:today,end:today},dsh:{enabled:false}};
 for(const [name,value] of Object.entries({'runtime.json':runtime,'dashboard.data.json':data,'graph.today.json':graph,'graph.week.json':graph,'graph.month.json':graph,'graph.all.json':graph})) await writeFile(join(dir,name),JSON.stringify(value));
 for(const name of ['report.html','data.js','chart.umd.min.js']) await writeFile(join(dir,name),'');
}`
  await writeFile(runner, script)
  const collector = createCollector({ artifactRoot: root, reportScript: runner, python: process.execPath })
  try {
    await collector.refresh()
    const initial = collector.snapshot()
    assert.equal(initial.phase, 'ready')
    assert.equal(initial.forecast.forecasts.all.actual, 5000)
    assert.ok(JSON.parse(await readFile(join(root, 'hourly-history.json'))).days.length > 0)
    assert.equal((await collector.reportData()).data.days.length, 1)
    await writeFile(join(root, 'fail'), 'fail next scan')
    await collector.refreshForecast()
    assert.equal(collector.snapshot().forecast.generatedAt, initial.forecast.generatedAt)
    assert.match(collector.snapshot().forecastError, /exited 2/)
  } finally {
    await collector.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCollector, FORECAST_INTERVAL_MS } from '../src/index.js'

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

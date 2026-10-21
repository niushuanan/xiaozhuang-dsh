import { cp, rm, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const source = new URL('../src/', import.meta.url)
const output = new URL('../lib/', import.meta.url)

await rm(output, { recursive: true, force: true })
await cp(source, output, { recursive: true })

// The distributed worker includes its regression dependency, so installation needs no Python ML runtime.
await build({ entryPoints: [fileURLToPath(new URL('../src/forecast-forest.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../lib/forecast-forest.js', import.meta.url)),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'eof' })

// One shared calculation serves Host summaries and the offline report, without another browser request.
const journey = await build({ entryPoints: [fileURLToPath(new URL('../src/journey.js', import.meta.url))],
  bundle: true, format: 'iife', globalName: 'TokenJourney', target: 'es2022', write: false, legalComments: 'none' })
const page = new URL('../assets/report.html', import.meta.url)
const html = await readFile(page, 'utf8')
await writeFile(page, html.replace(/\/\* token-journey:start \*\/[\s\S]*?\/\* token-journey:end \*\//,
  () => '/* token-journey:start */\n' + journey.outputFiles[0].text + '/* token-journey:end */'), 'utf8')

const models = await build({ entryPoints: [fileURLToPath(new URL('../src/model-data.js', import.meta.url))],
  bundle: true, format: 'iife', globalName: 'TokenModels', target: 'es2022', write: false, legalComments: 'none' })
const report = await readFile(page, 'utf8')
await writeFile(page, report.replace(/\/\* token-models:start \*\/[\s\S]*?\/\* token-models:end \*\//,
  () => '/* token-models:start */\n' + models.outputFiles[0].text + '/* token-models:end */'), 'utf8')

const growth = await build({ entryPoints: [fileURLToPath(new URL('../src/growth-forecast.js', import.meta.url))],
  bundle: true, format: 'iife', globalName: 'TokenGrowth', target: 'es2022', write: false, legalComments: 'none' })
const reportWithModels = await readFile(page, 'utf8')
await writeFile(page, reportWithModels.replace(/\/\* token-growth:start \*\/[\s\S]*?\/\* token-growth:end \*\//,
  () => '/* token-growth:start */\n' + growth.outputFiles[0].text + '/* token-growth:end */'), 'utf8')

import { cp, rm } from 'node:fs/promises'
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

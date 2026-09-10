/** Build the trading workspace in dependency order using its owned packages. */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const compiler = resolve(dirname(require.resolve('tsdown/package.json')), 'dist/run.mjs')
const root = new URL('../packages/', import.meta.url)
const packages = new Map(readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => {
    const directory = new URL(`${entry.name}/`, root)
    const manifest = JSON.parse(readFileSync(new URL('package.json', directory), 'utf8'))
    return [manifest.name, { directory, manifest }]
  }))
const built = new Set()
const visiting = new Set()

function build(name) {
  if (built.has(name)) return
  if (visiting.has(name)) throw new Error(`Trading package dependency cycle at ${name}`)
  visiting.add(name)
  const { directory, manifest } = packages.get(name)
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (packages.has(dependency)) build(dependency)
  }
  process.stdout.write(`Building ${name}\n`)
  const configurations = [undefined]
  if (existsSync(new URL('tsdown.client.config.mjs', directory))) configurations.push('tsdown.client.config.mjs')
  for (const config of configurations) {
    const result = spawnSync(process.execPath, [compiler, ...(config ? ['--config', config] : [])], {
      cwd: fileURLToPath(directory), stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  visiting.delete(name)
  built.add(name)
}

for (const name of packages.keys()) build(name)

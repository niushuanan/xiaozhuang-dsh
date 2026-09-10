/** Source-mode tests for the integrated trading packages. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const packages = fileURLToPath(new URL('./packages/', import.meta.url))
const aliases: { find: string; replacement: string }[] = []
for (const entry of readdirSync(packages, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const directory = resolve(packages, entry.name)
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
  for (const [key, value] of Object.entries(manifest.exports ?? {})) {
    if (typeof value !== 'object' || value === null || !('default' in value)) continue
    const source = key === './client' ? 'src/client/index.ts' : String(value.default).replace('./lib/', 'src/').replace(/\.js$/, '.ts')
    if (!existsSync(resolve(directory, source))) continue
    aliases.push({ find: manifest.name + (key === '.' ? '' : key.slice(1)), replacement: resolve(directory, source) })
  }
}
aliases.sort((a, b) => b.find.length - a.find.length)

export default defineConfig({
  root,
  plugins: [tsconfigPaths({ projects: [resolve(root, 'tsconfig.base.json')] }), standardDecoratorPlugin()],
  resolve: { alias: aliases },
  test: {
    include: ['plugins/trading/packages/*/test/**/*.test.{ts,tsx}', 'plugins/trading/tests/**/*.spec.ts', 'plugins/trading/tests/**/*.spec.tsx'],
    environment: 'node', pool: 'forks', execArgv: vitestExecArgv,
  },
})

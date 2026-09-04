/** Build orchestration for repository-local native product plugins. */

import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { discoverProductPluginBundles } from '../apps/cli/src/product-plugin-directory.ts'

/**
 * Build every physically present product plugin.
 * @param root - absolute product plugin directory.
 * @returns ids built in stable folder order.
 */
export async function buildProductPlugins(root: string): Promise<readonly string[]> {
  const bundles = await discoverProductPluginBundles(root)
  const built: string[] = []
  for (const bundle of bundles) {
    await execa('pnpm', ['run', 'bundle'], { cwd: bundle.directory, stdio: 'inherit' })
    built.push(bundle.id)
  }
  return built
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href
if (invokedPath === import.meta.url) {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL('../plugins', import.meta.url)))
  await buildProductPlugins(root)
}

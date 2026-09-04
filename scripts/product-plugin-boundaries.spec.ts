import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { discoverProductPluginBundles, loadProductPluginLayers } from '../apps/cli/src/product-plugin-directory.ts'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const pluginsRoot = join(repositoryRoot, 'plugins')
const expectedIds = [
  'adaptive-update',
  'better-sidebar',
  'chat-mode',
  'conversation-import',
  'fluent-output',
  'memory-system',
  'model-usage',
  'multi-window',
  'parallel-development',
  'plugin-manager',
  'product-companion',
  'runtime-pulse',
  'selection-actions',
  'session-modes',
  'skill-manager',
  'teamwork',
  'token-overview',
  'vision',
] as const

interface Manifest {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

async function manifestsBelow(directory: string): Promise<Array<{ path: string; manifest: Manifest }>> {
  const found: Array<{ path: string; manifest: Manifest }> = []
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'lib') continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) await visit(path)
      if (entry.isFile() && entry.name === 'package.json') {
        found.push({ path, manifest: JSON.parse(await readFile(path, 'utf8')) as Manifest })
      }
    }
  }
  await visit(directory)
  return found
}

describe('product plugin deletion boundaries', () => {
  it('has one discoverable native bundle and build entry per product capability', async () => {
    const bundles = await discoverProductPluginBundles(pluginsRoot)
    expect(bundles.map(bundle => bundle.id)).toEqual(expectedIds)
    expect(await loadProductPluginLayers(pluginsRoot)).toHaveLength(expectedIds.length)
    for (const bundle of bundles) {
      const manifest = JSON.parse(await readFile(bundle.manifestPath, 'utf8')) as Manifest
      expect(manifest.scripts?.bundle, `${bundle.id} must own its bundle build`).toBeTypeOf('string')
    }
  })

  it('contains no package dependency from one product plugin folder to another', async () => {
    const manifests = await manifestsBelow(pluginsRoot)
    const owners = new Map<string, string>()
    for (const item of manifests) {
      if (item.manifest.name !== undefined) owners.set(item.manifest.name, item.path)
    }
    for (const item of manifests) {
      const dependencies = {
        ...item.manifest.dependencies,
        ...item.manifest.peerDependencies,
        ...item.manifest.optionalDependencies,
      }
      for (const name of Object.keys(dependencies)) {
        const owner = owners.get(name)
        if (owner === undefined) continue
        const sourcePlugin = item.path.slice(pluginsRoot.length + 1).split('/')[0]
        const targetPlugin = owner.slice(pluginsRoot.length + 1).split('/')[0]
        expect(targetPlugin, `${sourcePlugin} depends on product plugin package ${name}`).toBe(sourcePlugin)
      }
    }
  })
})

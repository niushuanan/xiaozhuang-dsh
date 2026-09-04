import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))

function writePlugin(root: string, id: string, manifest: unknown = {
  name: `@xiaozhuang-dsh/${id}`,
  dsh: { bundle: { patch: './cordis.patch.yml' } },
}): void {
  const directory = join(root, id)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
  writeFileSync(join(directory, 'cordis.patch.yml'), '[]\n')
}

async function discover(root: string) {
  const module = await import('../src/profile-boot.ts')
  return module.discoverProductPluginBundles(root)
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('product plugin directory discovery', () => {
  it('treats an absent product plugin directory as an empty optional layer', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-plugins-'))
    roots.push(root)
    await expect(discover(join(root, 'missing'))).resolves.toEqual([])
  })

  it('discovers direct native bundles in lexical folder order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-plugins-'))
    roots.push(root)
    writePlugin(root, 'vision')
    writePlugin(root, 'better-sidebar')

    expect(await discover(root)).toEqual([
      {
        id: 'better-sidebar',
        directory: join(root, 'better-sidebar'),
        manifestPath: join(root, 'better-sidebar', 'package.json'),
        patchPath: join(root, 'better-sidebar', 'cordis.patch.yml'),
      },
      {
        id: 'vision',
        directory: join(root, 'vision'),
        manifestPath: join(root, 'vision', 'package.json'),
        patchPath: join(root, 'vision', 'cordis.patch.yml'),
      },
    ])
  })

  it('reflects a raw folder removal on the next discovery', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-plugins-'))
    roots.push(root)
    writePlugin(root, 'memory-system')
    writePlugin(root, 'token-overview')

    expect((await discover(root)).map(plugin => plugin.id)).toEqual(['memory-system', 'token-overview'])
    rmSync(join(root, 'memory-system'), { recursive: true })
    expect((await discover(root)).map(plugin => plugin.id)).toEqual(['token-overview'])
  })

  it('reports a present malformed plugin folder instead of silently skipping it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-plugins-'))
    roots.push(root)
    writePlugin(root, 'broken', { name: '@xiaozhuang-dsh/broken', dsh: {} })

    await expect(discover(root)).rejects.toThrow(
      `${join(root, 'broken', 'package.json')}: dsh.bundle.patch must be a non-empty relative path`,
    )
  })

  it('loads each bundle patch in folder order and anchors its relative plugin entry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-plugins-'))
    roots.push(root)
    writePlugin(root, 'vision')
    writePlugin(root, 'better-sidebar')
    writeFileSync(join(root, 'vision', 'cordis.patch.yml'), [
      '- insert:',
      '    - id: vision',
      '      name: ./lib/index.js',
      '',
    ].join('\n'))
    const module = await import('../src/profile-boot.ts') as Record<string, unknown>

    expect(module.loadProductPluginLayers).toBeTypeOf('function')
    const load = module.loadProductPluginLayers as (directory: string) => Promise<Array<{
      id: string
      patches: Array<{ insert?: Array<{ name?: string }> }>
    }>>
    const layers = await load(root)

    expect(layers.map(layer => layer.id)).toEqual(['better-sidebar', 'vision'])
    expect(layers[1]?.patches[0]?.insert?.[0]?.name).toBe(
      new URL('lib/index.js', `file://${join(root, 'vision')}/`).href,
    )
  })

  it('lets a present product folder absorb legacy duplicate rows and redirect a replaced upstream switch', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-plugins-'))
    roots.push(root)
    writePlugin(root, 'conversation-import', {
      name: '@xiaozhuang-dsh/conversation-import',
      dsh: {
        bundle: {
          patch: './cordis.patch.yml',
          replaces: { 'session-log-download': 'conversation-import' },
        },
      },
    })
    writeFileSync(join(root, 'conversation-import', 'cordis.patch.yml'), [
      '- id: session-log-download',
      '  disabled: true',
      '- insert:',
      '    - id: conversation-import',
      '      name: ./lib/index.js',
      '',
    ].join('\n'))

    const module = await import('../src/profile-boot.ts') as Record<string, unknown>
    const layers = await (module.loadProductPluginLayers as (directory: string) => Promise<Array<{
      patches: Array<Record<string, unknown>>
      replacements: Readonly<Record<string, string>>
    }>>)(root)
    const reconcile = module.reconcileProductPluginUserPatches as (
      layers: readonly unknown[],
      patches: readonly Record<string, unknown>[],
    ) => Array<Record<string, unknown>>

    expect(layers[0]?.replacements).toEqual({ 'session-log-download': 'conversation-import' })
    expect(reconcile(layers, [
      {
        insert: [
          { id: 'conversation-import', name: '@deepseek-ai/dsh-legacy-import', config: { source: 'legacy' } },
          { id: 'unrelated-user-plugin', name: 'user-plugin' },
        ],
      },
      { id: 'session-log-download', disabled: false },
    ])).toEqual([
      { insert: [{ id: 'unrelated-user-plugin', name: 'user-plugin' }] },
      { id: 'conversation-import', config: { source: 'legacy' } },
      { id: 'conversation-import', disabled: false },
    ])
  })

  it('leaves legacy rows untouched when the owning product folder is absent', async () => {
    const module = await import('../src/profile-boot.ts') as Record<string, unknown>
    const reconcile = module.reconcileProductPluginUserPatches as (
      layers: readonly unknown[],
      patches: readonly Record<string, unknown>[],
    ) => Array<Record<string, unknown>>
    const legacy = [
      { insert: [{ id: 'vision-local', name: '@deepseek-ai/dsh-vision-local' }] },
      { id: 'session-log-download', disabled: false },
    ]

    expect(reconcile([], legacy)).toEqual(legacy)
  })

  it('composes only physically present plugin bundles into the real Web config dump', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-plugins-'))
    const home = mkdtempSync(join(tmpdir(), 'dsh-product-home-'))
    roots.push(root, home)
    writePlugin(root, 'vision')
    writeFileSync(join(root, 'vision', 'cordis.patch.yml'), [
      '- insert:',
      '    - id: product-test-vision',
      '      name: ./index.mjs',
      '',
    ].join('\n'))
    writeFileSync(join(root, 'vision', 'index.mjs'), 'export const name = "product-test-vision"\n')

    const dump = async () => execa(process.execPath, [
      '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--dump-default-config',
    ], {
      cwd: repositoryRoot,
      env: { ...process.env, DSH_HOME: home, DSH_PRODUCT_PLUGINS_DIR: root },
      reject: false,
    })

    const present = await dump()
    expect(present.exitCode).toBe(0)
    expect(present.stdout).toContain('id: product-test-vision')
    rmSync(join(root, 'vision'), { recursive: true })

    const removed = await dump()
    expect(removed.exitCode).toBe(0)
    expect(removed.stdout).not.toContain('id: product-test-vision')
    expect(removed.stdout).toContain('id: modules')
  }, 30_000)
})

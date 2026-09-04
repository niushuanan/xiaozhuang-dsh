import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('product plugin build', () => {
  it('accepts a product with no plugin directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-build-'))
    roots.push(root)
    const module = await import('./product-plugins.ts').catch(() => ({})) as Record<string, unknown>

    expect(module.buildProductPlugins).toBeTypeOf('function')
    const build = module.buildProductPlugins as (directory: string) => Promise<unknown>
    await expect(build(join(root, 'missing'))).resolves.toEqual([])
  })

  it('executes the bundle script of each present plugin in folder order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-product-build-'))
    roots.push(root)
    for (const id of ['vision', 'better-sidebar']) {
      const directory = join(root, id)
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'package.json'), `${JSON.stringify({
        name: `@xiaozhuang-dsh/${id}`,
        private: true,
        scripts: { bundle: 'node ./build.mjs' },
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }, undefined, 2)}\n`)
      writeFileSync(join(directory, 'cordis.patch.yml'), '[]\n')
      writeFileSync(join(directory, 'build.mjs'), [
        "import { writeFileSync } from 'node:fs'",
        "writeFileSync('bundle-ran.txt', 'yes\\n')",
        '',
      ].join('\n'))
    }
    const { buildProductPlugins } = await import('./product-plugins.ts')

    await expect(buildProductPlugins(root)).resolves.toEqual(['better-sidebar', 'vision'])
    expect(existsSync(join(root, 'better-sidebar', 'bundle-ran.txt'))).toBe(true)
    expect(existsSync(join(root, 'vision', 'bundle-ran.txt'))).toBe(true)
  })
})

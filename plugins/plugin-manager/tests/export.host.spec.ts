import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { buildPluginExport, type PluginExportCatalog } from '../src/export.ts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture(): Promise<{ repositoryRoot: string; profilePackagesRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-export-'))
  temporaryRoots.push(root)
  const repositoryRoot = join(root, 'repository')
  const profilePackagesRoot = join(root, 'profile-packages')
  await mkdir(join(repositoryRoot, 'packages/native/src'), { recursive: true })
  await mkdir(join(repositoryRoot, 'packages/native/lib'), { recursive: true })
  await mkdir(join(repositoryRoot, 'packages/native/node_modules/secret'), { recursive: true })
  await mkdir(join(profilePackagesRoot, 'portable/lib'), { recursive: true })
  await mkdir(join(profilePackagesRoot, 'portable/node_modules/secret'), { recursive: true })
  await writeFile(join(repositoryRoot, 'packages/native/package.json'), '{"name":"@fixture/native"}')
  await writeFile(join(repositoryRoot, 'packages/native/src/index.ts'), 'export const native = true\n')
  await writeFile(join(repositoryRoot, 'packages/native/lib/index.js'), 'export const native = true\n')
  await writeFile(join(repositoryRoot, 'packages/native/lib/tsconfig.tsbuildinfo'), 'never export')
  await writeFile(join(repositoryRoot, 'packages/native/node_modules/secret/token'), 'never export')
  await writeFile(join(profilePackagesRoot, 'portable/package.json'), '{"name":"@fixture/portable"}')
  await writeFile(join(profilePackagesRoot, 'portable/lib/index.js'), 'export const portable = true\n')
  await writeFile(join(profilePackagesRoot, 'portable/node_modules/secret/token'), 'never export')
  return { repositoryRoot, profilePackagesRoot }
}

const catalog: PluginExportCatalog = {
  native: {
    id: 'native', name: '原生能力', rows: [{ id: 'native-row', name: '@fixture/native' }],
    sources: [{ kind: 'repository', path: 'packages/native' }],
  },
  portable: {
    id: 'portable', name: '便携能力', rows: [{ id: 'portable-row', name: '@fixture/portable' }],
    sources: [{ kind: 'profile', path: 'portable' }],
  },
}

describe('plugin export archive', () => {
  it('exports only selected catalog ids with AI instructions, hashes, and no machine state', async () => {
    const roots = await fixture()
    const result = await buildPluginExport({
      ...roots,
      catalog,
      selectedIds: ['portable'],
      sourceCommit: 'abc123',
      now: new Date('2026-08-26T04:05:06.000Z'),
    })
    const files = unzipSync(result.bytes)
    const names = Object.keys(files).sort()

    expect(result.filename).toBe('xiaozhuang-dsh-plugins-20260826-120506.zip')
    expect(names).toContain('AGENTS.md')
    expect(names).toContain('INSTALL.md')
    expect(names).toContain('README.md')
    expect(names).toContain('manifest.json')
    expect(names).toContain('payload/portable/profile/portable/lib/index.js')
    expect(names.some(name => name.includes('node_modules') || name.includes('token') || name.endsWith('.tsbuildinfo'))).toBe(false)
    expect(names.some(name => name.includes('/native/'))).toBe(false)

    const manifest = JSON.parse(strFromU8(files['manifest.json']!))
    expect(manifest.sourceCommit).toBe('abc123')
    expect(manifest.plugins.map((plugin: { id: string }) => plugin.id)).toEqual(['portable'])
    expect(manifest.files[0]).toMatchObject({ path: expect.any(String), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(strFromU8(files['INSTALL.md']!)).toContain('发生冲突或直接安装失败时')
    expect(strFromU8(files['AGENTS.md']!)).toContain('不得覆盖用户数据')
  })

  it('deduplicates selection, preserves repository-relative source, and rejects unknown ids', async () => {
    const roots = await fixture()
    const result = await buildPluginExport({
      ...roots,
      catalog,
      selectedIds: ['native', 'native'],
      sourceCommit: 'def456',
      now: new Date('2026-08-26T00:00:00.000Z'),
    })
    const files = unzipSync(result.bytes)
    expect(strFromU8(files['payload/native/repository/packages/native/src/index.ts']!)).toContain('native = true')
    await expect(buildPluginExport({
      ...roots,
      catalog,
      selectedIds: ['missing'],
      sourceCommit: 'def456',
      now: new Date(),
    })).rejects.toThrow('插件选择无效')
  })
})

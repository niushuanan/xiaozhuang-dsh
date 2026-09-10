import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { copyComposition, scanRoot } from '@deepseek-ai/dsh-agent-presets'
import { load as parse } from 'js-yaml'
import { describe, expect, it, vi } from 'vitest'
import { Config as PersonaConfig } from '../../../../../packages/preset/persona/src/index.ts'
import { apply, DEFAULT_PRESET_ROOT, PRESET_IDS } from '../src/presets.ts'

type Row = { id: string; name: string; config?: Record<string, unknown> }

describe('native optional trading roles', () => {
  it('registers built roles discoverable and copyable without trading packages in the host profile', async () => {
    const dispose = vi.fn()
    const registerRoot = vi.fn((_root: { path: string; trust: 'system' }) => dispose)
    const effects: Array<() => Promise<void>> = []
    const context = {
      agentPresets: { registerRoot },
      effect: (effect: () => () => Promise<void>) => { effects.push(effect()) },
    } as unknown as Context
    // Built integration: the product build must emit the 44 owned packages first.
    const harness = await mkdtemp(join(tmpdir(), 'dsh-trading-preset-review-'))
    let disposed = false
    try {
      await apply(context)
      const contributed = registerRoot.mock.calls[0]![0] as { path: string; trust: 'system' }
      expect(contributed.path).not.toBe(DEFAULT_PRESET_ROOT)
      const nativePackages = new Set<string>()
      for (const id of PRESET_IDS) {
        const text = await readFile(join(contributed.path, id, 'agent.cordis.yml'), 'utf8')
        expect(text).not.toMatch(/name:\s*['"]@dshtrading\//)
        for (const match of text.matchAll(/name:\s*['"](@deepseek-ai\/[^'"]+)['"]/g)) nativePackages.add(match[1]!)
      }
      const require = createRequire(import.meta.url)
      for (const name of nativePackages) {
        const link = join(harness, 'node_modules', name)
        await mkdir(dirname(link), { recursive: true })
        await symlink(dirname(require.resolve(`${name}/package.json`)), link, 'dir')
      }
      const base = pathToFileURL(join(harness, 'entry.js')).href
      const presets = await scanRoot(contributed, base)
      expect(presets.map(preset => preset.id).sort()).toEqual([...PRESET_IDS].sort())
      expect(presets.map(preset => preset.broken)).toEqual([undefined, undefined, undefined, undefined])
      const userRoot = { path: join(harness, 'user-presets'), trust: 'user' as const }
      await copyComposition([userRoot], presets.find(preset => preset.id === 'trading-master')!, 'custom-trading-master')
      await effects[0]!()
      disposed = true
      expect(dispose).toHaveBeenCalledOnce()
      expect(existsSync(contributed.path)).toBe(false)
      expect((await scanRoot(userRoot, base))[0]).toMatchObject({ id: 'custom-trading-master' })
      expect((await scanRoot(userRoot, base))[0]!.broken).toBeUndefined()
    } finally {
      if (!disposed) await effects[0]?.()
      await rm(harness, { recursive: true, force: true })
    }
  })

  it('ships all four roles with the current persona schema and explicit simulated execution', async () => {
    for (const id of PRESET_IDS) {
      const text = await readFile(join(DEFAULT_PRESET_ROOT, id, 'agent.cordis.yml'), 'utf8')
      const rows = parse(text) as Row[]
      const persona = rows.find(row => row.name === '@deepseek-ai/dsh-persona')!
      expect(PersonaConfig(persona.config).text).toContain('Always reply in the language the user writes in')
      expect(text).not.toContain('liveTrading: true')
      expect(text).not.toContain('dryRun: false')
      expect(text).not.toContain('dynamic-capabilities')
      expect(text).not.toContain('/Users/')
      for (const market of ['crypto', 'us', 'cn', 'hk']) {
        expect(rows.find(row => row.name === `@dshtrading/kit-${market}`)?.config).toMatchObject({ dryRun: true, liveTrading: false })
      }
      expect(rows.map(row => row.id).length).toBe(new Set(rows.map(row => row.id)).size)
      if (id === 'trading-researcher' || id === 'trading-risk-reviewer') {
        expect(text).not.toContain("name: '@dshtrading/connector-")
        expect(rows.some(row => row.name === '@dshtrading/base/research-tools')).toBe(true)
      } else {
        expect(text).toContain("name: '@dshtrading/connector-")
      }
    }
  })
})

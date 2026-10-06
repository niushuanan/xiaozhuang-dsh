import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { load as parse } from 'js-yaml'
import { describe, expect, it, vi } from 'vitest'
import { Config as PersonaConfig } from '../../../../../packages/preset/persona/src/index.ts'
import { apply, DEFAULT_PRESET_ROOT, PRESET_IDS } from '../src/presets.ts'

type Row = { id: string; name: string; config?: Record<string, unknown> }

describe('native optional trading roles', () => {
  it('registers four declarative roles with built module URLs and disposable ownership', async () => {
    const definitions: Array<{ id: string; plugins: Row[] }> = []
    const disposers: Array<() => Promise<void>> = []
    const dispose = vi.fn(async () => {})
    const context = {
      agentPresets: { register: vi.fn(async (definition: { id: string; plugins: Row[] }) => { definitions.push(definition); return dispose }) },
      effect: async (effect: () => Promise<() => Promise<void>>) => { const off = await effect(); disposers.push(off) },
    } as unknown as Context
    await apply(context)
    expect(definitions.map(row => row.id)).toEqual([...PRESET_IDS])
    for (const definition of definitions) {
      expect(JSON.stringify(definition.plugins)).not.toMatch(/"name":"@dshtrading\//)
      expect(definition.plugins.find(row => row.id === 'persona')?.config).toHaveProperty('prefix')
    }
    for (const off of disposers) await off()
    expect(dispose).toHaveBeenCalledTimes(4)
  })

  it('ships all four roles with the current persona schema and explicit simulated execution', async () => {
    for (const id of PRESET_IDS) {
      const text = await readFile(join(DEFAULT_PRESET_ROOT, id, 'agent.cordis.yml'), 'utf8')
      const rows = parse(text) as Row[]
      const persona = rows.find(row => row.name === '@deepseek-ai/dsh-persona')!
      expect(PersonaConfig(persona.config).prefix).toContain('Always reply in the language the user writes in')
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

/**
 * The shipped presets are this package's own, not an assembly fact each app
 * must patch in: a roster configured with nothing still supplies the built-in
 * compositions, prepended so they always mount and win a duplicate id.
 * `includeShippedRoot: false` is how a deployment supplying purely its own
 * presets — or an embedder using the roster as bare machinery — opts out.
 *
 * `$DSH_HOME` is repointed per test for the same reason as the user-root
 * suite: the derived writable root is resolved in the constructor.
 */

import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include, { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import * as yaml from 'js-yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AgentPresets, { SHIPPED_PRESET_ROOT, type Config } from '@deepseek-ai/dsh-agent-presets'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const SYSTEM_ROOT = join(FIXTURES, 'system')

let previousHome: string | undefined

beforeEach(async () => {
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'dsh-shipped-root-'))
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
})

/** Boot a roster with the shipped root left to the plugin's default. */
async function roster(config: Partial<Config> = {}): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(AgentPresets, {
    default: 'standard',
    roots: [],
    includeShippedRoot: true,
    includeUserRoot: true,
    ...config,
  })
  return ctx
}

describe('the shipped preset root', () => {
  it('supplies the built-in presets from a bare roster, healthy and system-trusted', async () => {
    const ctx = await roster({ includeUserRoot: false })

    const listed = await ctx.agentPresets.list()
    expect(listed.map(preset => preset.id).sort()).toEqual(['chat', 'cordis', 'minimal', 'ptc', 'standard'])
    expect(listed.every(preset => preset.trust === 'system')).toBe(true)
    // Not `broken === undefined`: health asks whether each row's package is
    // installed above the base, and the shipped rows name packages the
    // deployment installs beside the roster. This fixture base is not that
    // install, so unresolved rows are the only reason it can report here —
    // malformed would be a different one, and this asserts there is none.
    expect(listed.map(preset => preset.broken)
      .filter(reason => reason !== undefined && !reason.includes('cannot be resolved'))).toEqual([])
  })

  it('prepends the shipped root before configured roots and the derived user root', async () => {
    const ctx = await roster({ roots: [{ path: SYSTEM_ROOT, trust: 'user' }] })

    expect(ctx.agentPresets.roots.map(root => root.path)).toEqual([
      SHIPPED_PRESET_ROOT,
      SYSTEM_ROOT,
      expect.stringContaining('.agent-presets'),
    ])
    expect(ctx.agentPresets.roots[0]).toEqual({ path: SHIPPED_PRESET_ROOT, trust: 'system' })
    // Prepended, so a configured directory claiming a shipped id is shadowed:
    // the fixture root also carries `minimal`, and the roster serves the
    // shipped one.
    const minimal = (await ctx.agentPresets.list()).find(preset => preset.id === 'minimal')
    expect(minimal?.path.startsWith(SHIPPED_PRESET_ROOT)).toBe(true)
  })

  it('mounts a roster without the shipped set when includeShippedRoot is false', async () => {
    const ctx = await roster({
      includeShippedRoot: false,
      includeUserRoot: false,
      roots: [{ path: SYSTEM_ROOT, trust: 'system' }],
    })

    expect(ctx.agentPresets.roots).toEqual([{ path: SYSTEM_ROOT, trust: 'system' }])
    const minimal = (await ctx.agentPresets.list()).find(preset => preset.id === 'minimal')
    expect(minimal?.path.startsWith(SYSTEM_ROOT)).toBe(true)
  })

  it('enables web_fetch in each tool-bearing Web app preset', async () => {
    for (const id of ['cordis', 'ptc', 'standard']) {
      const source = await readFile(join(SHIPPED_PRESET_ROOT, id, 'agent.cordis.yml'), 'utf8')
      const entries: unknown = yaml.load(source, { schema: entryListSchema })
      if (!Array.isArray(entries)) throw new TypeError(`${id} preset must contain a Cordis entry list`)
      const toolWeb: unknown = entries.find((entry: unknown) =>
        typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === 'tool-web')
      if (typeof toolWeb !== 'object' || toolWeb === null || !('config' in toolWeb)
        || typeof toolWeb.config !== 'object' || toolWeb.config === null || !('fetch' in toolWeb.config)) {
        throw new TypeError(`${id} preset must configure tool-web.fetch`)
      }
      expect(toolWeb.config.fetch, id).toBe(true)
    }
  })

  it('exposes installed Codex and Z Code providers through every tool-bearing preset', async () => {
    for (const id of ['cordis', 'ptc', 'standard']) {
      const source = await readFile(join(SHIPPED_PRESET_ROOT, id, 'agent.cordis.yml'), 'utf8')
      const entries: unknown = yaml.load(source, { schema: entryListSchema })
      if (!Array.isArray(entries)) throw new TypeError(`${id} preset must contain a Cordis entry list`)
      const parsedEntries = entries as readonly unknown[]
      const delegation = parsedEntries.find((entry: unknown) =>
        typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === 'delegation')
      if (typeof delegation !== 'object' || delegation === null || !('config' in delegation)
        || !Array.isArray(delegation.config)) {
        throw new TypeError(`${id} preset must contain a delegation group`)
      }
      const rows = delegation.config as readonly Record<string, unknown>[]
      const codex = rows.find(row => row.id === 'tool-subagent-codex')
      const zcode = rows.find(row => row.id === 'tool-subagent-zcode')

      if (!codex || typeof codex.config !== 'object' || codex.config === null) {
        throw new TypeError(`${id} preset must contain a configured Codex expert`)
      }
      expect(codex.name, `${id} Codex package`).toBe('@deepseek-ai/dsh-tool-subagent')
      expect(codex.config, `${id} Codex config`).toMatchObject({
        provider: 'codex',
        toolName: 'subagent_codex',
        backgroundMode: 'one-shot',
        maxDepth: 'provider-managed',
      })
      expect('routingGuidance' in codex.config && codex.config.routingGuidance, `${id} Codex routing`).toContain('Codex')
      expect(codex, `${id} Codex row`).not.toHaveProperty('disabled', true)

      if (!zcode || typeof zcode.config !== 'object' || zcode.config === null) {
        throw new TypeError(`${id} preset must contain a configured Z Code expert`)
      }
      expect(zcode.name, `${id} Z Code package`).toBe('@deepseek-ai/dsh-tool-subagent')
      expect(zcode.config, `${id} Z Code config`).toMatchObject({
        provider: 'zcode',
        toolName: 'subagent_zcode',
        backgroundMode: 'one-shot',
        maxDepth: 'provider-managed',
      })
      expect('routingGuidance' in zcode.config && zcode.config.routingGuidance, `${id} Z Code routing`).toContain('Z Code')
      expect(zcode, `${id} Z Code row`).not.toHaveProperty('disabled', true)
    }

    for (const id of ['chat', 'minimal']) {
      const source = await readFile(join(SHIPPED_PRESET_ROOT, id, 'agent.cordis.yml'), 'utf8')
      expect(source, id).not.toContain('subagent_codex')
      expect(source, id).not.toContain('subagent_zcode')
    }
  })

  it('gives the Chat preset real web search without coding or filesystem tools', async () => {
    const source = await readFile(join(SHIPPED_PRESET_ROOT, 'chat', 'agent.cordis.yml'), 'utf8')
    const entries: unknown = yaml.load(source, { schema: entryListSchema })
    if (!Array.isArray(entries)) throw new TypeError('chat preset must contain a Cordis entry list')
    const rows = entries as readonly unknown[]
    const ids = rows.flatMap(entry => (
      typeof entry === 'object' && entry !== null && 'id' in entry && typeof entry.id === 'string'
        ? [entry.id]
        : []
    ))

    expect(ids).toContain('tool-web')
    expect(ids).not.toContain('tool-filesystem')
    expect(ids).not.toContain('tool-bash')
  })
})

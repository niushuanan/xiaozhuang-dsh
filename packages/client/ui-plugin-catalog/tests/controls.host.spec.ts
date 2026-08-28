import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PLUGIN_EXPORT_CATALOG, PLUGIN_ROWS } from '../src/catalog.ts'
import { apply, externalConfigFromSwitchBlock, replaceSwitchBlock, snapshot, statesFromSwitchBlock } from '../src/index.ts'

function loaderWith(overrides: Record<string, { disabled?: boolean; state?: number; fiber?: null }> = {}): Context['loader'] {
  const entries = Object.values(PLUGIN_ROWS).flat().map(id => ({
    options: { id },
    disabled: overrides[id]?.disabled ?? false,
    fiber: overrides[id]?.fiber === null ? undefined : { state: overrides[id]?.state ?? 2 },
  }))
  return { entries: () => entries } as unknown as Context['loader']
}

async function requestBrandAsset(path: string): Promise<{
  status: number
  headers: Map<string, string>
  body: Buffer
}> {
  let handler: ((req: IncomingMessage, res: ServerResponse) => void) | undefined
  const ctx = {
    loader: loaderWith(),
    webServer: { register(route: { handler: typeof handler }) { handler = route.handler; return () => undefined } },
    effect(run: () => unknown) { return run() },
  } as unknown as Context
  apply(ctx)
  expect(handler).toBeTypeOf('function')

  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    const headers = new Map<string, string>()
    const res = {
      statusCode: 0,
      setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value) },
      end(value?: string | Buffer) {
        if (value !== undefined) chunks.push(Buffer.from(value))
        resolve({ status: this.statusCode, headers, body: Buffer.concat(chunks) })
      },
    } as unknown as ServerResponse
    handler?.({ method: 'GET', url: path, headers: {} } as IncomingMessage, res)
  })
}

describe('native plugin catalog controls', () => {
  it('serves the original expert logos through versioned revalidatable URLs', async () => {
    const codex = await requestBrandAsset('/plugins/xiaozhuang-plugins/api/assets/codex-brand-v2.png')
    const zcode = await requestBrandAsset('/plugins/xiaozhuang-plugins/api/assets/zcode-brand-v2.png')

    for (const response of [codex, zcode]) {
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('cache-control')).toBe('no-cache')
      expect([...response.body.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    }
    expect(codex.body.equals(zcode.body)).toBe(false)
  })

  it('reports compound capability state from every mapped Loader row', () => {
    expect(snapshot(loaderWith()).plugins.find(plugin => (plugin as { id: string }).id === 'better-sidebar')).toMatchObject({ enabled: true, phase: 'active' })
    expect(snapshot(loaderWith({ 'better-sidebar': { state: 1 } })).plugins.find(plugin => (plugin as { id: string }).id === 'better-sidebar')).toMatchObject({ enabled: false, phase: 'transitioning' })
    expect(PLUGIN_ROWS['better-sidebar']).toEqual(['better-sidebar'])
    expect(PLUGIN_ROWS['plain-chat']).toEqual(['ui-chat'])
    expect(PLUGIN_ROWS['adaptive-update']).toEqual(['ui-adaptive-update'])
    expect(PLUGIN_ROWS).not.toHaveProperty('computer-use')
    expect(PLUGIN_ROWS).not.toHaveProperty('composer-add-menu')
    expect(PLUGIN_EXPORT_CATALOG['better-sidebar']?.name).toBe('侧边工作台')
    expect(PLUGIN_EXPORT_CATALOG['better-sidebar']?.sources).toContainEqual({
      kind: 'repository', path: 'packages/workbench/better-sidebar',
    })
    expect(PLUGIN_EXPORT_CATALOG['skill-manager']?.name).toBe('Skill 管理')
    expect(PLUGIN_EXPORT_CATALOG['adaptive-update']?.name).toBe('持续适配')
    expect(PLUGIN_EXPORT_CATALOG['plain-chat']?.sources).toContainEqual({
      kind: 'repository', path: 'apps/cli/config/agent-presets/chat',
    })
  })

  it('keeps collaborator rows and persisted intent while replacing its bounded block', () => {
    const desired = Object.fromEntries(Object.keys(PLUGIN_ROWS).map(id => [id, true]))
    const source = replaceSwitchBlock('- insert:\n  - id: unrelated\n', desired, {
      codex: { model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' },
      zcode: { providerId: 'builtin:zai', modelId: 'GLM-5.3', reasoningEffort: 'max' },
    })
    expect(source).toContain('- id: subagent-codex-local\n  disabled: false')
    expect(source).toContain('- id: subagent-zcode-local\n  disabled: false')
    expect(source).toContain('- id: unrelated')
    expect(externalConfigFromSwitchBlock(source).codex.reasoningEffort).toBe('xhigh')
    expect(statesFromSwitchBlock(source, loaderWith({ 'team-work': { state: 1 } })).teamwork).toBe(true)
  })
})

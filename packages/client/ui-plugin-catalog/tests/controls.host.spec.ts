import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
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
        resolve({ status: res.statusCode, headers, body: Buffer.concat(chunks) })
      },
    } as unknown as ServerResponse
    handler?.({ method: 'GET', url: path, headers: {} } as IncomingMessage, res)
  })
}

async function requestToggle(id: string): Promise<{ status: number; body: string; patch: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-toggle-'))
  const patchPath = join(directory, 'cordis.patch.yml')
  await writeFile(patchPath, '- insert:\n  - id: unrelated\n')
  let handler: ((req: IncomingMessage, res: ServerResponse) => void) | undefined
  const ctx = {
    loader: loaderWith(),
    webServer: { register(route: { handler: typeof handler }) { handler = route.handler; return () => undefined } },
    effect(run: () => unknown) { return run() },
  } as unknown as Context
  apply(ctx, { patchPath })
  expect(handler).toBeTypeOf('function')

  try {
    const response = await new Promise<{ status: number; body: string }>((resolve) => {
      const req = Readable.from([JSON.stringify({ id, enabled: true })]) as IncomingMessage
      Object.assign(req, { method: 'PUT', url: '/plugins/xiaozhuang-plugins/api/toggle', headers: {} })
      const res = {
        statusCode: 0,
        setHeader() {},
        end(value?: string | Buffer) { resolve({ status: res.statusCode, body: value?.toString() ?? '' }) },
      } as unknown as ServerResponse
      handler?.(req, res)
    })
    return { ...response, patch: await readFile(patchPath, 'utf8') }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
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
    expect(PLUGIN_ROWS['chat-mode']).toEqual(['ui-plain-chat'])
    expect(PLUGIN_ROWS['conversation-import']).toEqual(['session-log-download'])
    expect(PLUGIN_ROWS).not.toHaveProperty('plain-chat')
    expect(PLUGIN_ROWS).not.toHaveProperty('chat-migration')
    expect(PLUGIN_ROWS['adaptive-update']).toEqual(['ui-adaptive-update'])
    expect(PLUGIN_ROWS).not.toHaveProperty('computer-use')
    expect(PLUGIN_ROWS).not.toHaveProperty('composer-add-menu')
    expect(PLUGIN_EXPORT_CATALOG['better-sidebar']?.name).toBe('侧边工作台')
    expect(PLUGIN_EXPORT_CATALOG['better-sidebar']?.sources).toContainEqual({
      kind: 'repository', path: 'packages/workbench/better-sidebar',
    })
    expect(PLUGIN_EXPORT_CATALOG['skill-manager']?.name).toBe('Skill 管理')
    expect(PLUGIN_EXPORT_CATALOG['adaptive-update']?.name).toBe('持续适配')
    expect(PLUGIN_EXPORT_CATALOG['chat-mode']?.name).toBe('聊天模式')
    expect(PLUGIN_EXPORT_CATALOG['chat-mode']?.rows).toEqual([
      { id: 'ui-plain-chat', name: '@deepseek-ai/dsh-client-ui-plain-chat' },
      { id: 'composer-add-menu', name: '@deepseek-ai/dsh-composer-add-menu' },
    ])
    expect(PLUGIN_EXPORT_CATALOG['chat-mode']?.sources).toEqual(expect.arrayContaining([
      { kind: 'repository', path: 'packages/client/ui-plain-chat' },
      { kind: 'repository', path: 'packages/client/ui-composer-add-menu' },
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/chat' },
    ]))
    expect(PLUGIN_EXPORT_CATALOG['conversation-import']?.name).toBe('导入对话')
    expect(PLUGIN_EXPORT_CATALOG['conversation-import']?.rows).toEqual([
      { id: 'session-log-download', name: '@deepseek-ai/dsh-session-log-export' },
    ])
    expect(PLUGIN_EXPORT_CATALOG['conversation-import']?.sources).toEqual(expect.arrayContaining([
      { kind: 'repository', path: 'packages/client/connection' },
      { kind: 'repository', path: 'packages/session-query/session-log-export' },
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/chat' },
    ]))
    expect(PLUGIN_EXPORT_CATALOG.teamwork?.sources).toEqual(expect.arrayContaining([
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/standard' },
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/ptc' },
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/cordis' },
    ]))
    const codexRow = PLUGIN_EXPORT_CATALOG.teamwork?.rows.find(row => row.id === 'tool-subagent-codex-local')
    const zcodeRow = PLUGIN_EXPORT_CATALOG.teamwork?.rows.find(row => row.id === 'tool-subagent-zcode-local')
    expect(codexRow?.config?.routingGuidance).toContain('Codex')
    expect(zcodeRow?.config?.routingGuidance).toContain('Z Code')
  })

  it('keeps switches usable for an already-open legacy catalog page', async () => {
    const plainChat = await requestToggle('plain-chat')
    expect(plainChat.status).toBe(200)
    expect(plainChat.patch).toContain('- id: ui-plain-chat\n  disabled: false')

    const chatMigration = await requestToggle('chat-migration')
    expect(chatMigration.status).toBe(200)
    expect(chatMigration.patch).toContain('- id: ui-plain-chat\n  disabled: false')
    expect(chatMigration.patch).toContain('- id: session-log-download\n  disabled: false')
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

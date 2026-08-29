import { Context } from '@deepseek-ai/cordis'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import type { BrowserAuth } from '@deepseek-ai/dsh-client-connection/src/browser-auth.ts'
import type { Session, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRawArtifact } from '@deepseek-ai/dsh-session-persistence'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  Config,
  SESSION_DEEPSEEK_IMPORT_PATH,
  SESSION_LOG_EXPORT_PATH,
  apply,
  inject,
} from '../src/index.ts'

const sid = (value: string): SessionId => value as SessionId

function artifact(id: string): SessionRawArtifact {
  const header: SessionHeader = {
    version: 0,
    id: sid(id),
    createdAt: 1,
    cwd: '/workspace',
    delegationDepth: 0,
  }
  return {
    meta: header,
    filename: 'session.jsonl',
    content: `${JSON.stringify({ type: 'session', ...header })}\n`,
  }
}

async function mounted(withServices: boolean, initialPersisted: readonly SessionId[] = []): Promise<{
  readonly connection: HostConnectionService
  readonly cachedSessions: Session[]
  readonly dispose: () => Promise<void>
}> {
  const ctx = new Context()
  const cachedSessions: Session[] = []
  ctx.provide('commands', { register: () => () => {} } as never)
  if (withServices) {
    ctx.provide('sessionQuery', {
      traceSession: async () => ({ descendants: [] }),
    } as never)
    const persisted: SessionId[] = [...initialPersisted]
    ctx.provide('sessionPersistence', {
      supportsRawArtifacts: true,
      readRaw: async (id: SessionId) => artifact(String(id)),
      listSnapshots: async () => persisted.map(id => ({ header: { id } })),
      create: async () => {},
      append: async (id: SessionId) => { persisted.push(id) },
    } as never)
    ctx.provide('attachments', {
      readImage: async () => { throw new Error('fixture has no images') },
    } as never)
    ctx.provide('sessionProjectionCache', {
      write: async (session: Session) => { cachedSessions.push(session) },
    } as never)
  }
  const connection = new HostConnectionService(ctx, [], {} as BrowserAuth)
  // Mirror the Loader's traced injection scope. Optional services remain
  // reachable through Context#get, but undeclared direct property reads fail.
  const fiber = ctx.inject([...inject], child => apply(child))
  await fiber
  return { connection, cachedSessions, dispose: () => fiber.dispose() }
}

describe('Session log export Fetch route', () => {
  it('registers one GET/HEAD route and removes it with the plugin fiber', async () => {
    const { connection, dispose } = await mounted(true)
    const shared = connection.createSharedFetchHandler('/api')

    const response = await shared.fetch(new Request(
      `http://host${SESSION_LOG_EXPORT_PATH}?sessionId=session-1`,
    ))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
    expect(strFromU8(files['session.jsonl'] as Uint8Array)).toContain('"id":"session-1"')

    const head = await shared.fetch(new Request(
      `http://host${SESSION_LOG_EXPORT_PATH}?sessionId=session-1`, { method: 'HEAD' },
    ))
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()

    await dispose()
    expect((await shared.fetch(new Request(
      `http://host${SESSION_LOG_EXPORT_PATH}?sessionId=session-1`,
    ))).status).toBe(404)
  })

  it('validates the query before reporting missing export services', async () => {
    const { connection, dispose } = await mounted(false)
    const shared = connection.createSharedFetchHandler('/api')
    expect((await shared.fetch(new Request(`http://host${SESSION_LOG_EXPORT_PATH}`))).status).toBe(400)
    expect((await shared.fetch(new Request(
      `http://host${SESSION_LOG_EXPORT_PATH}?sessionId=session-1&includeDescendants=1`,
    ))).status).toBe(400)
    expect((await shared.fetch(new Request(
      `http://host${SESSION_LOG_EXPORT_PATH}?sessionId=session-1`,
    ))).status).toBe(500)
    await dispose()
  })

  it('imports an authenticated DeepSeek JSON export through the native Session route', async () => {
    const { connection, cachedSessions, dispose } = await mounted(true)
    const shared = connection.createSharedFetchHandler('/api')
    const body = JSON.stringify([{
      id: 'deepseek-route-fixture',
      title: '从 DeepSeek 导入',
      inserted_at: '2026-08-29T00:00:00.000Z',
      updated_at: '2026-08-29T00:00:05.000Z',
      mapping: {
        root: { id: 'root', parent: null, children: ['u1'], message: null },
        u1: {
          id: 'u1', parent: 'root', children: [],
          message: {
            inserted_at: '2026-08-29T00:00:00.000Z',
            fragments: [{ type: 'REQUEST', content: '你好' }],
          },
        },
      },
    }])

    const response = await shared.fetch(new Request(`http://host${SESSION_DEEPSEEK_IMPORT_PATH}`, {
      method: 'POST', body, headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ imported: 1, skipped: 0, failed: 0 })
    expect(cachedSessions).toHaveLength(1)
    expect(cachedSessions[0]?.header.agentPreset).toBe('chat')
    expect(cachedSessions[0]?.events.find(event => event.type === 'session/title')?.data.title)
      .toBe('从 DeepSeek 导入')
    const repeated = await shared.fetch(new Request(`http://host${SESSION_DEEPSEEK_IMPORT_PATH}`, {
      method: 'POST', body, headers: { 'content-type': 'application/json' },
    }))
    expect(await repeated.json()).toMatchObject({ imported: 0, skipped: 1, failed: 0 })
    expect(cachedSessions).toHaveLength(1)
    await dispose()
  })

  it('previews every DeepSeek window without writing and marks already imported conversations', async () => {
    const existing = sid('session-deepseek-feb113f9e00c73598fbbc0ad')
    const { connection, cachedSessions, dispose } = await mounted(true, [existing])
    const shared = connection.createSharedFetchHandler('/api')
    const body = JSON.stringify([
      {
        id: 'existing-preview', title: '已经导入', inserted_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        mapping: {
          root: { id: 'root', parent: null, children: ['u1'], message: null },
          u1: {
            id: 'u1', parent: 'root', children: [],
            message: { inserted_at: '2026-08-01T00:00:00.000Z', fragments: [{ type: 'REQUEST', content: '旧问题' }] },
          },
        },
      },
      {
        id: 'new-preview', title: '尚未导入', inserted_at: '2026-08-02T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:05.000Z',
        mapping: {
          root: { id: 'root', parent: null, children: ['u1'], message: null },
          u1: {
            id: 'u1', parent: 'root', children: ['a1'],
            message: { inserted_at: '2026-08-02T00:00:00.000Z', fragments: [{ type: 'REQUEST', content: '新问题' }] },
          },
          a1: {
            id: 'a1', parent: 'u1', children: [],
            message: {
              inserted_at: '2026-08-02T00:00:05.000Z',
              fragments: [{ type: 'THINK', content: '思考' }, { type: 'RESPONSE', content: '新回答' }],
            },
          },
        },
      },
    ])

    const response = await shared.fetch(new Request(
      `http://host${SESSION_DEEPSEEK_IMPORT_PATH}?mode=preview`,
      { method: 'POST', body, headers: { 'content-type': 'application/json' } },
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      total: 2,
      available: 1,
      imported: 1,
      conversations: [
        {
          sourceId: 'new-preview', title: '尚未导入', createdAt: 1_785_628_800_000,
          updatedAt: 1_785_628_805_000, messageCount: 2, reasoningCount: 1, imported: false,
        },
        {
          sourceId: 'existing-preview', title: '已经导入', createdAt: 1_785_542_400_000,
          updatedAt: 1_785_542_400_000, messageCount: 1, reasoningCount: 0, imported: true,
        },
      ],
    })
    expect(cachedSessions).toHaveLength(0)
    await dispose()
  })

  it('imports only selected DeepSeek windows from the retained browser file', async () => {
    const { connection, cachedSessions, dispose } = await mounted(true)
    const shared = connection.createSharedFetchHandler('/api')
    const body = JSON.stringify([
      {
        id: 'select-first', title: '不要导入', inserted_at: '2026-08-01T00:00:00.000Z',
        mapping: {
          root: { id: 'root', parent: null, children: ['u1'], message: null },
          u1: { id: 'u1', parent: 'root', children: [], message: { fragments: [{ type: 'REQUEST', content: '一' }] } },
        },
      },
      {
        id: 'select-second', title: '只导入这个', inserted_at: '2026-08-02T00:00:00.000Z',
        mapping: {
          root: { id: 'root', parent: null, children: ['u1'], message: null },
          u1: { id: 'u1', parent: 'root', children: [], message: { fragments: [{ type: 'REQUEST', content: '二' }] } },
        },
      },
    ])
    const form = new FormData()
    form.append('file', new Blob([body], { type: 'application/json' }), 'deepseek.json')
    form.append('selection', JSON.stringify(['select-second']))

    const response = await shared.fetch(new Request(`http://host${SESSION_DEEPSEEK_IMPORT_PATH}`, {
      method: 'POST', body: form,
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ imported: 1, skipped: 0, failed: 0 })
    expect(cachedSessions).toHaveLength(1)
    expect(cachedSessions[0]?.events.find(event => event.type === 'session/title')?.data.title)
      .toBe('只导入这个')
    await dispose()
  })

  it('validates the compression level', () => {
    expect(Config({})).toEqual({ compressionLevel: 6 })
    expect(Config({ compressionLevel: 0 })).toEqual({ compressionLevel: 0 })
    expect(Config({ compressionLevel: 9 })).toEqual({ compressionLevel: 9 })
    for (const compressionLevel of [-1, 10, 1.5]) {
      expect(() => Config({ compressionLevel } as never)).toThrow()
    }
  })
})

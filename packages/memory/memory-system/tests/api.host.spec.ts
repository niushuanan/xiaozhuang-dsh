import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { MEMORY_API_ROUTE, memoryApiHandler } from '../src/api.ts'

function request(method: string, path: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, {
    method,
    url: path,
    headers: { host: '127.0.0.1:3080', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  }) as unknown as IncomingMessage
}

function response() {
  let text = ''
  const res = {
    statusCode: 200,
    setHeader: () => undefined,
    end: (value?: string | Buffer) => { text = value?.toString() ?? '' },
  } as unknown as ServerResponse
  return { res, read: () => ({ status: res.statusCode, body: JSON.parse(text) as Record<string, unknown> }) }
}

describe('memory host API', () => {
  it('loads and revision-saves one fixed document kind', async () => {
    const service = {
      documents: vi.fn(async () => ({ user: { kind: 'user' }, ai: { kind: 'ai' }, state: {} })),
      write: vi.fn(async () => ({ kind: 'user', content: 'new', revision: 'r2' })),
      restore: vi.fn(),
      remember: vi.fn(),
    }
    const loaded = response()
    await memoryApiHandler(request('GET', `${MEMORY_API_ROUTE}/documents`), loaded.res, service as never)
    expect(loaded.read()).toMatchObject({ status: 200, body: { user: { kind: 'user' }, ai: { kind: 'ai' } } })

    const saved = response()
    await memoryApiHandler(request('PUT', `${MEMORY_API_ROUTE}/documents/user`, {
      content: 'new', revision: 'r1',
    }), saved.res, service as never)
    expect(saved.read()).toMatchObject({ status: 200, body: { content: 'new', revision: 'r2' } })
    expect(service.write).toHaveBeenCalledWith('user', 'new', 'r1')
  })

  it('accepts a bounded selection-memory packet and rejects remote callers', async () => {
    const service = {
      documents: vi.fn(), write: vi.fn(), restore: vi.fn(),
      remember: vi.fn(async () => ({ summary: '已沉淀', changed: true, revision: 'r2' })),
    }
    const remembered = response()
    await memoryApiHandler(request('POST', `${MEMORY_API_ROUTE}/remember`, {
      selectedText: '先做主链路', context: '发布讨论', sessionId: 's1', sourceType: 'dsh',
    }), remembered.res, service as never)
    expect(remembered.read()).toMatchObject({ status: 200, body: { summary: '已沉淀', changed: true } })

    const remoteRequest = request('GET', `${MEMORY_API_ROUTE}/documents`)
    remoteRequest.headers.host = 'example.com'
    const remote = response()
    await memoryApiHandler(remoteRequest, remote.res, service as never)
    expect(remote.read().status).toBe(403)
  })

  it('rejects cross-site and non-JSON memory mutations before calling the service', async () => {
    const service = {
      documents: vi.fn(), write: vi.fn(), restore: vi.fn(),
      remember: vi.fn(async () => ({ summary: '不应写入', changed: true, revision: 'r2' })),
    }
    const body = {
      selectedText: '先做主链路', context: '发布讨论', sessionId: 's1', sourceType: 'dsh',
    }

    const crossSiteRequest = request('POST', `${MEMORY_API_ROUTE}/remember`, body)
    crossSiteRequest.headers.origin = 'https://evil.example'
    crossSiteRequest.headers['sec-fetch-site'] = 'cross-site'
    const crossSite = response()
    await memoryApiHandler(crossSiteRequest, crossSite.res, service as never)
    expect(crossSite.read().status).toBe(403)

    const plainRequest = request('POST', `${MEMORY_API_ROUTE}/remember`, body)
    plainRequest.headers['content-type'] = 'text/plain'
    const plain = response()
    await memoryApiHandler(plainRequest, plain.res, service as never)
    expect(plain.read().status).toBe(415)
    expect(service.remember).not.toHaveBeenCalled()
  })

  it('rejects arbitrary kinds and oversized selection text', async () => {
    const service = { documents: vi.fn(), write: vi.fn(), restore: vi.fn(), remember: vi.fn() }
    const wrongKind = response()
    await memoryApiHandler(request('PUT', `${MEMORY_API_ROUTE}/documents/other`, {
      content: '', revision: 'missing',
    }), wrongKind.res, service as never)
    expect(wrongKind.read().status).toBe(404)

    const oversized = response()
    await memoryApiHandler(request('POST', `${MEMORY_API_ROUTE}/remember`, {
      selectedText: 'x'.repeat(40_000), context: '', sessionId: 's1', sourceType: 'dsh',
    }), oversized.res, service as never)
    expect(oversized.read().status).toBe(413)
  })
})

/**
 * `browser.probe` route tests: the probe must refuse IP-literal hosts (IPv4
 * and IPv6) before any fetch, and must never follow redirects (redirect:
 * 'error' — a redirecting target resolves to `{ reachable: false }` through
 * the existing catch path).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'
import type { SidebarWebRoute } from '../src/context-types.ts'

interface FakeRes {
  status: number
  headers: Record<string, string>
  body: string
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string | Buffer): void
}

function fakeRes(): FakeRes {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      if (body !== undefined) this.body = body.toString()
    },
  } as FakeRes
}

function req(url: string, body: unknown): IncomingMessage {
  const chunks = [Buffer.from(JSON.stringify(body))]
  return {
    method: 'POST',
    url,
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk
    },
  } as unknown as IncomingMessage
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Mount apply() and return the /sidebar/api handler plus its disposers. */
function mount(): { api: (r: IncomingMessage, s: ServerResponse) => Promise<void>; cleanup: () => void } {
  const routes: SidebarWebRoute[] = []
  const effects: Array<() => void> = []
  const ctx = {
    webRuntime: { trustedHosts: [] },
    webServer: {
      register: (route: SidebarWebRoute) => { routes.push(route); return () => {} },
      registerUpgrade: () => () => {},
    },
    sessions: { get: () => undefined },
    tools: { register: () => () => {} },
    subprocess: { spawnTerminal: async () => { throw new Error('unused in the browser-probe suite') } },
    effect: (fn: () => (() => void) | undefined) => {
      const cleanup = fn()
      if (cleanup !== undefined) effects.push(cleanup)
    },
    inject: () => () => {},
    get: () => undefined,
  }
  apply(ctx as never)
  const api = routes.find(route => route.kind === 'prefix' && route.path === '/sidebar/api')?.handler
  if (api === undefined) throw new Error('test setup: /sidebar/api route not registered')
  return {
    api: api as (r: IncomingMessage, s: ServerResponse) => Promise<void>,
    cleanup: () => { for (const cleanup of effects) cleanup() },
  }
}

async function probe(api: (r: IncomingMessage, s: ServerResponse) => Promise<void>, url: string): Promise<FakeRes> {
  const res = fakeRes()
  await api(req('/sidebar/api/browser.probe', { url }), res as unknown as ServerResponse)
  return res
}

describe('browser.probe', () => {
  it('refuses an IPv4 literal before any fetch', async () => {
    const { api, cleanup } = mount()
    try {
      const fetchMock = vi.fn().mockRejectedValue(new Error('must not be called'))
      vi.stubGlobal('fetch', fetchMock)
      const res = await probe(api, 'http://192.168.1.5/')
      expect(res.status).toBe(400)
      expect(JSON.parse(res.body)).toMatchObject({ ok: false, error: { code: 'bad-request' } })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it('refuses an IPv6 literal before any fetch', async () => {
    const { api, cleanup } = mount()
    try {
      const fetchMock = vi.fn().mockRejectedValue(new Error('must not be called'))
      vi.stubGlobal('fetch', fetchMock)
      const res = await probe(api, 'http://[fe80::1]/')
      expect(res.status).toBe(400)
      expect(JSON.parse(res.body)).toMatchObject({ ok: false, error: { code: 'bad-request' } })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it('does not follow redirects and returns reachable:false on a fetch failure', async () => {
    const { api, cleanup } = mount()
    try {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('redirected'))
      vi.stubGlobal('fetch', fetchMock)
      const res = await probe(api, 'https://example.com/')
      expect(res.status).toBe(200)
      expect(JSON.parse(res.body)).toEqual({ ok: true, value: { reachable: false } })
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ method: 'HEAD', redirect: 'error' }),
      )
    } finally {
      cleanup()
    }
  })
})

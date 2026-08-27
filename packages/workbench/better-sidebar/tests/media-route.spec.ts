/**
 * /sidebar/file media-route response tests: the route serves raw bytes for
 * every supported extension, but HTML and SVG are active content and must
 * carry the same CSP `sandbox` directive as /sidebar/html so a direct
 * navigation lands in an opaque origin (an <img> embed of an SVG is a
 * document-less load and is unaffected). PNG (and other inert types) keep no
 * sandbox header.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
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

function req(method: string, url: string): IncomingMessage {
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
  } as unknown as IncomingMessage
}

const SANDBOX_CSP = "sandbox allow-scripts allow-popups allow-downloads allow-modals; object-src 'none'"

const temporaryRoots: string[] = []
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Mount apply() and return the /sidebar/file handler plus its disposers. */
function mount(): { file: (r: IncomingMessage, s: ServerResponse) => Promise<void>; cleanup: () => void } {
  const runtime = { trustedHosts: [] as string[] }
  const routes: SidebarWebRoute[] = []
  const effects: Array<() => void> = []
  const ctx = {
    webRuntime: runtime,
    webServer: {
      register: (route: SidebarWebRoute) => { routes.push(route); return () => {} },
      registerUpgrade: () => () => {},
    },
    sessions: { get: () => undefined },
    tools: { register: () => () => {} },
    subprocess: { spawnTerminal: async () => { throw new Error('unused in the media-route suite') } },
    effect: (fn: () => (() => void) | undefined) => {
      const cleanup = fn()
      if (cleanup !== undefined) effects.push(cleanup)
    },
    inject: () => () => {},
    get: () => undefined,
  }
  apply(ctx as never)
  const file = routes.find(route => route.kind === 'prefix' && route.path === '/sidebar/file')?.handler
  if (file === undefined) throw new Error('test setup: /sidebar/file route not registered')
  return {
    file: file as (r: IncomingMessage, s: ServerResponse) => Promise<void>,
    cleanup: () => { for (const cleanup of effects) cleanup() },
  }
}

/** Write a temp workspace and return { dir, path }. */
function tempFile(name: string, body: string | Buffer): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sidebar-media-'))
  temporaryRoots.push(dir)
  const path = join(dir, name)
  writeFileSync(path, body)
  return { dir, path }
}

async function fetchFile(
  file: (r: IncomingMessage, s: ServerResponse) => Promise<void>,
  path: string,
  dir: string,
): Promise<FakeRes> {
  const res = fakeRes()
  await file(req('GET', `/sidebar/file?sessionId=s1&path=${encodeURIComponent(path)}&cwd=${encodeURIComponent(dir)}`), res as unknown as ServerResponse)
  return res
}

describe('/sidebar/file media route', () => {
  it('adds the CSP sandbox header to HTML responses', async () => {
    const { file, cleanup } = mount()
    try {
      const { dir, path } = tempFile('a.html', '<h1>hi</h1>')
      const res = await fetchFile(file, path, dir)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('text/html')
      expect(res.headers['content-security-policy']).toBe(SANDBOX_CSP)
    } finally {
      cleanup()
    }
  })

  it('adds the CSP sandbox header to SVG responses', async () => {
    const { file, cleanup } = mount()
    try {
      const { dir, path } = tempFile('b.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
      const res = await fetchFile(file, path, dir)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/svg+xml')
      expect(res.headers['content-security-policy']).toBe(SANDBOX_CSP)
    } finally {
      cleanup()
    }
  })

  it('keeps inert types (png) free of the sandbox header', async () => {
    const { file, cleanup } = mount()
    try {
      const { dir, path } = tempFile('c.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      const res = await fetchFile(file, path, dir)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/png')
      expect(res.headers['content-security-policy']).toBeUndefined()
    } finally {
      cleanup()
    }
  })
})

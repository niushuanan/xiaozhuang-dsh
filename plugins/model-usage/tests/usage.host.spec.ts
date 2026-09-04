// Host route caching contract: cold collection mirrors to disk, a stale disk
// snapshot answers instantly and revalidates out of band, and force bypasses.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { UsageSnapshot } from '../src/quota.ts'

vi.mock('../src/quota.ts', () => ({ collectUsage: vi.fn() }))

const snapshotA: UsageSnapshot = {
  updatedAt: Date.parse('2026-08-27T03:00:00Z'),
  providers: [{ id: 'deepseek', name: 'DeepSeek', kind: 'money', status: 'ok', money: { currency: 'CNY', total: 138.83 } }],
}
const snapshotB: UsageSnapshot = {
  updatedAt: Date.parse('2026-08-26T03:00:00Z'),
  providers: [{ id: 'deepseek', name: 'DeepSeek', kind: 'money', status: 'ok', money: { currency: 'CNY', total: 99 } }],
}

let home: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'provider-quota-'))
  vi.stubEnv('DSH_HOME', home)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  // A trailing background revalidation may still be writing; removal is best-effort.
  await rm(home, { recursive: true, force: true }).catch(() => undefined)
})

const cachePath = (): string => join(home, 'provider-quota-cache.json')

/**
 * Fresh module graph per case: the cache state is module-level, so every case
 * mounts its own instance against its own DSH_HOME sandbox.
 */
async function mount(): Promise<{
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  collect: ReturnType<typeof vi.fn>
}> {
  vi.resetModules()
  const quota = await import('../src/quota.ts')
  const module = await import('../src/index.ts')
  const collect = vi.mocked(quota.collectUsage)
  collect.mockClear()
  let mounted: { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> } | undefined
  const ctx = {
    effect: (mountRoute: () => unknown) => { mountRoute(); return () => undefined },
    webServer: { register: (route: unknown) => {
      mounted = route as { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
      return () => undefined
    } },
  }
  module.apply(ctx as unknown as Context)
  if (mounted === undefined) throw new Error('usage route was not registered')
  return { handler: mounted.handler, collect: vi.mocked(quota.collectUsage) }
}

function request(path: string): { req: IncomingMessage; res: ServerResponse; body: () => { status: number; json: unknown } } {
  const req = Readable.from([]) as unknown as IncomingMessage
  req.method = 'GET'
  req.url = path
  req.headers = { host: '127.0.0.1:3080' }
  let raw = ''
  const res = {
    statusCode: 200,
    setHeader: () => undefined,
    end: (value?: string | Buffer) => { raw = value?.toString() ?? '' },
  } as unknown as ServerResponse
  return { req, res, body: () => ({ status: res.statusCode, json: JSON.parse(raw) as unknown }) }
}

describe('provider-quota usage route', () => {
  it('collects a cold first request, mirrors it to disk, and serves the mirror afterwards', async () => {
    const { handler, collect } = await mount()
    collect.mockResolvedValue(snapshotA)

    const cold = request('/plugins/ui-provider-quota/api/usage')
    await handler(cold.req, cold.res)
    expect(cold.body()).toEqual({ status: 200, json: snapshotA })
    expect(collect).toHaveBeenCalledTimes(1)
    expect(JSON.parse(await readFile(cachePath(), 'utf8'))).toEqual(snapshotA)

    // A fresh in-memory cache answers without another collection pass.
    const warm = request('/plugins/ui-provider-quota/api/usage')
    await handler(warm.req, warm.res)
    expect(warm.body()).toEqual({ status: 200, json: snapshotA })
    expect(collect).toHaveBeenCalledTimes(1)
  })

  it('answers an expired disk snapshot instantly and refreshes it out of band', async () => {
    await writeFile(cachePath(), JSON.stringify(snapshotB), 'utf8')
    const { handler, collect } = await mount()
    collect.mockResolvedValue(snapshotA)

    const first = request('/plugins/ui-provider-quota/api/usage')
    await handler(first.req, first.res)
    // Stale-but-instant: the old snapshot ships before any vendor is queried.
    expect(first.body()).toEqual({ status: 200, json: snapshotB })

    await vi.waitFor(() => expect(collect).toHaveBeenCalledTimes(1))
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(cachePath(), 'utf8'))).toEqual(snapshotA)
    })

    // The revalidated entry is now fresh in memory.
    const second = request('/plugins/ui-provider-quota/api/usage')
    await handler(second.req, second.res)
    expect(second.body()).toEqual({ status: 200, json: snapshotA })
    expect(collect).toHaveBeenCalledTimes(1)
  })

  it('treats a broken disk cache as a cold start instead of failing', async () => {
    await writeFile(cachePath(), '{broken', 'utf8')
    const { handler, collect } = await mount()
    collect.mockResolvedValue(snapshotA)

    const single = request('/plugins/ui-provider-quota/api/usage')
    await handler(single.req, single.res)
    expect(single.body()).toEqual({ status: 200, json: snapshotA })
    expect(collect).toHaveBeenCalledTimes(1)
  })
})

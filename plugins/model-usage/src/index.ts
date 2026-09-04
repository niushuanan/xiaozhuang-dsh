/**
 * Provider-quota plugin, node half: serves the aggregated usage snapshot at
 * `/plugins/ui-provider-quota/api/usage` (longest-prefix-wins over the bundle
 * server's `/plugins` route). Same-origin serving is what lets the browser
 * half call vendor APIs without CORS or key exposure — keys never leave the
 * host, and the response carries no key material.
 *
 * Caching is the latency contract for the panel: the newest snapshot lives in
 * memory for five minutes, is mirrored to `~/.dsh/provider-quota-cache.json`
 * so the first open after a restart is instant, and an expired entry is served
 * immediately while one background revalidation refreshes it. Only `?force=1`
 * (the refresh button and the open-state poll) collects against the vendors
 * on the critical path; a cold start with no cached snapshot anywhere is the
 * one case that still waits for collection.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { collectUsage, type UsageSnapshot } from './quota.ts'

export type { ProviderReport, QuotaRow, UsageSnapshot } from './quota.ts'

/** The route mount needs the web carrier service. */
export const inject = ['webServer']

const ROUTE_PATH = '/plugins/ui-provider-quota/api'
const ZCODE_ICON_PATH = new URL('../assets/zcode.png', import.meta.url)
const CACHE_TTL_MS = 5 * 60_000
const CACHE_PATH = join(resolveDshHome(), 'provider-quota-cache.json')

let cached: { snapshot: UsageSnapshot; expiresAt: number } | undefined
let inflight: Promise<UsageSnapshot> | undefined
let diskLoad: Promise<void> | undefined

/** Best-effort disk mirror; persistence failures only cost startup speed. */
async function persistCache(snapshot: UsageSnapshot): Promise<void> {
  const temporaryPath = `${CACHE_PATH}.tmp`
  try {
    await mkdir(dirname(CACHE_PATH), { recursive: true })
    await writeFile(temporaryPath, JSON.stringify(snapshot), 'utf8')
    await rename(temporaryPath, CACHE_PATH)
  } catch { /* the accelerator must never surface as a user-facing failure */ }
}

/** Load the disk mirror exactly once per process with `expiresAt: 0` — served instantly, then revalidated. */
function ensureDiskLoaded(): Promise<void> {
  diskLoad ??= (async () => {
    try {
      const parsed = JSON.parse(await readFile(CACHE_PATH, 'utf8')) as unknown
      const providers = (parsed as { providers?: unknown } | null)?.providers
      const updatedAt = (parsed as { updatedAt?: unknown } | null)?.updatedAt
      if (typeof updatedAt === 'number' && Array.isArray(providers)) {
        cached = { snapshot: parsed as UsageSnapshot, expiresAt: 0 }
      }
    } catch { /* absent or broken cache starts the process cold */ }
  })()
  return diskLoad
}

/** One shared collection pass; concurrent callers wait on the same flight. */
function revalidate(): Promise<UsageSnapshot> {
  inflight ??= collectUsage()
    .then(async (snapshot) => {
      cached = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS }
      // Committing before resolving makes "200 with snapshot" mean persisted.
      await persistCache(snapshot)
      return snapshot
    })
    .finally(() => { inflight = undefined })
  return inflight
}

async function usageSnapshot(force: boolean): Promise<UsageSnapshot> {
  if (force) return revalidate()
  await ensureDiskLoaded()
  if (cached !== undefined) {
    if (cached.expiresAt > Date.now()) return cached.snapshot
    // Stale but instant: serve the old snapshot and refresh out of band.
    void revalidate()
    return cached.snapshot
  }
  return revalidate()
}

function send(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

async function sendZCodeIcon(res: ServerResponse): Promise<void> {
  try {
    const icon = await readFile(ZCODE_ICON_PATH)
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.end(icon)
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  }
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname.endsWith('/assets/zcode.png')) {
    if (req.method !== 'GET') {
      send(res, 405, JSON.stringify({ error: 'method not allowed' }))
      return
    }
    await sendZCodeIcon(res)
    return
  }
  if (!url.pathname.endsWith('/usage')) {
    send(res, 404, JSON.stringify({ error: 'not found' }))
    return
  }
  if (req.method !== 'GET') {
    send(res, 405, JSON.stringify({ error: 'method not allowed' }))
    return
  }
  try {
    const snapshot = await usageSnapshot(url.searchParams.get('force') === '1')
    send(res, 200, JSON.stringify(snapshot))
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  }
}

/** Host plugin body: mount the usage route for the lifetime of the fiber. */
export function apply(ctx: Context): void {
  ctx.effect(
    () => {
      // Warm the disk mirror while the app boots so the panel's first open
      // after a restart answers from cache instead of the vendors.
      void ensureDiskLoaded()
      return ctx.webServer.register({ kind: 'prefix', path: ROUTE_PATH, handler })
    },
    'ui-provider-quota: usage route',
  )
}

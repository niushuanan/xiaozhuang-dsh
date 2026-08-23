/**
 * Provider-quota plugin, node half: serves the aggregated usage snapshot at
 * `/plugins/ui-provider-quota/api/usage` (longest-prefix-wins over the bundle
 * server's `/plugins` route). Same-origin serving is what lets the browser
 * half call vendor APIs without CORS or key exposure — keys never leave the
 * host, and the response carries no key material.
 *
 * The snapshot is cached for five minutes per process; `?force=1` bypasses.
 */

import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { collectUsage, type UsageSnapshot } from './quota.ts'

export type { ProviderReport, QuotaRow, UsageSnapshot } from './quota.ts'

/** The route mount needs the web carrier service. */
export const inject = ['webServer']

const ROUTE_PATH = '/plugins/ui-provider-quota/api'
const ZCODE_ICON_PATH = new URL('../assets/zcode.png', import.meta.url)
const CACHE_TTL_MS = 5 * 60_000

let cached: { snapshot: UsageSnapshot; expiresAt: number } | undefined
let inflight: Promise<UsageSnapshot> | undefined

async function usageSnapshot(force: boolean): Promise<UsageSnapshot> {
  if (!force && cached !== undefined && cached.expiresAt > Date.now()) return cached.snapshot
  inflight ??= collectUsage()
    .then((snapshot) => {
      cached = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS }
      return snapshot
    })
    .finally(() => { inflight = undefined })
  return inflight
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
      const dispose = ctx.webServer.register({ kind: 'prefix', path: ROUTE_PATH, handler })
      // Warm all provider calls before the user opens the panel. Failure stays
      // soft: the first request can retry and the host plugin remains healthy.
      void usageSnapshot(false).catch(() => undefined)
      return dispose
    },
    'ui-provider-quota: usage route',
  )
}

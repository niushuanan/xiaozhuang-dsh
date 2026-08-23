/**
 * Product companion, Host half: serves the generated sprite frames from the
 * same origin as the Web client. The browser half contributes the actual
 * cross-page companion through the shell overlay slot.
 */

import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Host route prefix for immutable companion frames. */
export const ASSET_ROUTE = '/plugins/ui-product-companion/assets'

const FRAME_NAMES = new Set([
  'blue-idle.png', 'blue-working.png', 'blue-waiting.png', 'blue-success.png', 'blue-sleep.png',
  'black-idle.png', 'black-working.png', 'black-waiting.png', 'black-success.png', 'black-sleep.png',
])

/** Required host service. */
export const inject = ['webServer']

function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(body)
}

/** Serve one whitelisted frame; paths never reach the filesystem unchecked. */
async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendText(res, 405, 'method not allowed')
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const name = url.pathname.slice(ASSET_ROUTE.length + 1)
  if (!FRAME_NAMES.has(name)) {
    sendText(res, 404, 'not found')
    return
  }
  try {
    const data = await readFile(new URL(`../assets/${name}`, import.meta.url))
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.end(data)
  } catch {
    sendText(res, 404, 'not found')
  }
}

/** Mount the asset route for the lifetime of this native plugin. */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ASSET_ROUTE, handler }),
    'ui-product-companion: generated frame assets',
  )
}

/**
 * Product companion, Host half: serves the generated sprite frames from the
 * same origin as the Web client. The browser half contributes the actual
 * cross-page companion through the shell overlay slot.
 */

import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { GLOBAL_RULES_API_ROUTE, globalRulesApiHandler } from './global-rules-host.ts'

/** Host route prefix for immutable companion frames. */
export const ASSET_ROUTE = '/plugins/ui-product-companion/assets'

const FRAME_COUNTS = {
  lounge: 20,
  portal: 12,
  focus: 12,
  waiting: 12,
  success: 12,
} as const

const FRAME_NAMES = new Set(
  ['blue', 'black'].flatMap(skin =>
    (Object.entries(FRAME_COUNTS) as [keyof typeof FRAME_COUNTS, number][]).flatMap(([clip, count]) =>
      Array.from({ length: count }, (_, index) =>
        `v14/${skin}-${clip}-${String(index + 1).padStart(2, '0')}.png`,
      ),
    ),
  ),
)
for (const skin of ['blue', 'black']) {
  for (let index = 1; index <= 20; index += 1) {
    FRAME_NAMES.add(`v9/${skin}-portal-effect-${String(index).padStart(2, '0')}.png`)
  }
}
for (let index = 1; index <= 48; index += 1) {
  const suffix = String(index).padStart(2, '0')
  FRAME_NAMES.add(`v13/body-mask-${suffix}.png`)
  FRAME_NAMES.add(`v13/fragment-mask-${suffix}.png`)
}

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
  ctx.effect(() => {
    const disposeAssets = ctx.webServer.register({ kind: 'prefix', path: ASSET_ROUTE, handler })
    const disposeGlobalRules = ctx.webServer.register({
      kind: 'prefix',
      path: GLOBAL_RULES_API_ROUTE,
      handler: (req, res) => { void globalRulesApiHandler(req, res) },
    })
    return () => {
      disposeGlobalRules()
      disposeAssets()
    }
  }, 'ui-product-companion: generated assets and global rules API')
}

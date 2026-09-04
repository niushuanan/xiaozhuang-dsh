/** Loopback HTTP API for native continuous-adaptation actions. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AutomaticUpdateService } from './automatic.ts'
import type { IdleUpdateView, UpdateSnapshot } from './types.ts'

/** Fixed same-origin route owned by the native plugin. */
export const ADAPTIVE_UPDATE_API_ROUTE = '/plugins/ui-adaptive-update/api'

/** Host operations consumed by the HTTP carrier. */
export interface AdaptiveUpdateService {
  state(): Promise<IdleUpdateView | UpdateSnapshot>
  start(): Promise<UpdateSnapshot>
  idle(): boolean
}

/** Expected product/API failure with an explicit HTTP status. */
export class AdaptiveUpdateApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const authority = req.headers.host ?? ''
  const host = authority.startsWith('[')
    ? authority.slice(1, authority.indexOf(']'))
    : authority.split(':')[0] ?? ''
  if (host !== 'localhost' && host !== '::1' && !host.startsWith('127.')) return false
  const site = req.headers['sec-fetch-site']
  return site === undefined || site === 'same-origin' || site === 'none'
}

/**
 * Serve state, manual start, automatic-update, and worker-only idle probes on loopback.
 * @param req - Host HTTP request.
 * @param res - Host HTTP response.
 * @param service - continuous-adaptation engine.
 * @param automatic - persistent official-repository monitor.
 */
export async function adaptiveUpdateApiHandler(
  req: IncomingMessage,
  res: ServerResponse,
  service: AdaptiveUpdateService,
  automatic?: AutomaticUpdateService,
): Promise<void> {
  if (!isLoopbackRequest(req)) {
    sendJson(res, 403, { error: '持续适配仅能在本机使用' })
    return
  }
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  try {
    if (req.method === 'GET' && path === `${ADAPTIVE_UPDATE_API_ROUTE}/state`) {
      sendJson(res, 200, await service.state())
      return
    }
    if (req.method === 'POST' && path === `${ADAPTIVE_UPDATE_API_ROUTE}/start`) {
      sendJson(res, 202, await service.start())
      return
    }
    if (req.method === 'GET' && path === `${ADAPTIVE_UPDATE_API_ROUTE}/automatic` && automatic !== undefined) {
      sendJson(res, 200, await automatic.automaticState())
      return
    }
    if (req.method === 'POST' && path === `${ADAPTIVE_UPDATE_API_ROUTE}/automatic/enable`
      && automatic !== undefined) {
      sendJson(res, 200, await automatic.setAutomatic(true))
      return
    }
    if (req.method === 'POST' && path === `${ADAPTIVE_UPDATE_API_ROUTE}/automatic/disable`
      && automatic !== undefined) {
      sendJson(res, 200, await automatic.setAutomatic(false))
      return
    }
    if (req.method === 'GET' && path === `${ADAPTIVE_UPDATE_API_ROUTE}/idle`) {
      sendJson(res, 200, { idle: service.idle() })
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    const status = error instanceof AdaptiveUpdateApiError ? error.status : 500
    sendJson(res, status, { error: error instanceof Error ? error.message : String(error) })
  }
}

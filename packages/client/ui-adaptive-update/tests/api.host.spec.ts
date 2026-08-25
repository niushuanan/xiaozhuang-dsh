import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  ADAPTIVE_UPDATE_API_ROUTE,
  AdaptiveUpdateApiError,
  adaptiveUpdateApiHandler,
  type AdaptiveUpdateService,
} from '../src/api.ts'

function request(method: string, path: string, host = '127.0.0.1:3080'): IncomingMessage {
  return Object.assign(Readable.from([]), {
    method,
    url: path,
    headers: { host, origin: `http://${host}`, 'sec-fetch-site': 'same-origin' },
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

function service(): AdaptiveUpdateService {
  return {
    state: vi.fn(async (): ReturnType<AdaptiveUpdateService['state']> => ({
      phase: 'idle', currentCommit: 'a'.repeat(40),
    })),
    start: vi.fn(async (): ReturnType<AdaptiveUpdateService['start']> => ({
      schemaVersion: 1,
      phase: 'discovering',
      jobId: 'job-1',
      workerPid: 123,
      currentCommit: 'a'.repeat(40),
      startedAt: '2026-08-26T01:00:00.000Z',
      updatedAt: '2026-08-26T01:00:00.000Z',
      checks: [],
    })),
    idle: vi.fn(() => true),
  }
}

describe('adaptive update Host API', () => {
  it('reads state, starts one operation, and exposes the internal idle probe', async () => {
    const target = service()
    const state = response()
    await adaptiveUpdateApiHandler(request('GET', `${ADAPTIVE_UPDATE_API_ROUTE}/state`), state.res, target)
    expect(state.read()).toMatchObject({ status: 200, body: { phase: 'idle' } })

    const started = response()
    await adaptiveUpdateApiHandler(request('POST', `${ADAPTIVE_UPDATE_API_ROUTE}/start`), started.res, target)
    expect(started.read()).toMatchObject({ status: 202, body: { phase: 'discovering', jobId: 'job-1' } })

    const idle = response()
    await adaptiveUpdateApiHandler(request('GET', `${ADAPTIVE_UPDATE_API_ROUTE}/idle`), idle.res, target)
    expect(idle.read()).toEqual({ status: 200, body: { idle: true } })
  })

  it('rejects remote callers and maps an active operation to conflict', async () => {
    const target = service()
    const remote = response()
    await adaptiveUpdateApiHandler(
      request('GET', `${ADAPTIVE_UPDATE_API_ROUTE}/state`, 'example.com'),
      remote.res,
      target,
    )
    expect(remote.read().status).toBe(403)

    target.start = vi.fn(async () => { throw new AdaptiveUpdateApiError(409, 'already running') })
    const active = response()
    await adaptiveUpdateApiHandler(request('POST', `${ADAPTIVE_UPDATE_API_ROUTE}/start`), active.res, target)
    expect(active.read()).toEqual({ status: 409, body: { error: 'already running' } })
  })
})

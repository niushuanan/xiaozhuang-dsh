/** Browser launch-token and persistent-cookie behavior. */

import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { BrowserAuth } from '../src/browser-auth.ts'
import type { ConnectionIndexRequest, ConnectionIndexResponse } from '../src/rpc.ts'
import { RecordCredentials } from './browser-credentials.ts'

function signedCookie(store: RecordCredentials, name: string, payload: unknown): string {
  const body = typeof payload === 'string'
    ? Buffer.from(payload, 'utf8').toString('base64url')
    : Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return signedBodyCookie(store, name, body)
}

function signedBodyCookie(store: RecordCredentials, name: string, body: string): string {
  const record = store.record
  if (record?.kind !== 'grant' || typeof record.payload !== 'object' || record.payload === null) {
    throw new Error('test credential store has no signing secret')
  }
  const secret: unknown = Reflect.get(record.payload, 'secret')
  if (typeof secret !== 'string') throw new Error('test credential record has no string secret')
  const signature = createHmac('sha256', Buffer.from(secret, 'base64url')).update(body).digest('base64url')
  return `${name}=v1.${body}.${signature}`
}

interface ResponseState {
  status?: number
  headers?: Readonly<Record<string, string>>
  body?: string
}

function response(): { value: ConnectionIndexResponse; state: ResponseState } {
  const state: ResponseState = {}
  return {
    value: {
      writeHead(status, headers) {
        state.status = status
        if (headers !== undefined) state.headers = headers
      },
      end(body) {
        if (body !== undefined) state.body = body
      },
    },
    state,
  }
}

function credentials(store: RecordCredentials): CredentialProvider {
  return store as unknown as CredentialProvider
}

function createAuth(
  store: RecordCredentials,
  maxAgeDays = 30,
  processOwner: object = {},
): Promise<BrowserAuth> {
  return BrowserAuth.create(processOwner, credentials(store), maxAgeDays)
}

function request(url: string, authority = 'harness.example:3080', init?: {
  cookie?: string
  method?: string
}): ConnectionIndexRequest {
  return {
    method: init?.method ?? 'GET',
    url,
    headers: {
      host: authority,
      ...init?.cookie === undefined ? {} : { cookie: init.cookie },
    },
  }
}

function exchange(
  auth: BrowserAuth,
  authority = 'harness.example:3080',
): { cookie: string; launchUrl: string; state: ResponseState } {
  const launchUrl = auth.authenticatedUrl(`http://${authority}`)
  const target = new URL(launchUrl)
  const res = response()
  expect(auth.authorizeIndex(request(`${target.pathname}${target.search}`, authority), res.value)).toBe(false)
  const setCookie = res.state.headers?.['set-cookie']
  if (setCookie === undefined) throw new Error('token exchange did not set a cookie')
  return { cookie: setCookie.split(';', 1)[0]!, launchUrl, state: res.state }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('BrowserAuth', () => {
  it('opens the local desktop without a launch token and renews an expired login', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T00:00:00.000Z'))
    const auth = await createAuth(new RecordCredentials())
    const local = {
      ...request('/', '127.0.0.1:3080'),
      socket: { remoteAddress: '127.0.0.1' },
    }
    expect(auth.authenticatedUrl('http://127.0.0.1:3080')).toBe('http://127.0.0.1:3080/')
    const opened = response()
    expect(auth.authorizeIndex(local, opened.value)).toBe(false)
    expect(opened.state.status).toBe(303)
    expect(opened.state.headers?.location).toBe('/')
    const cookie = opened.state.headers?.['set-cookie']?.split(';', 1)[0]
    expect(cookie).toBeDefined()
    const saved = { ...local, headers: { host: '127.0.0.1:3080', cookie } }
    expect(auth.authorizeIndex(saved, response().value)).toBe(true)

    vi.setSystemTime(new Date('2026-11-06T00:00:00.000Z'))
    expect(auth.isAuthenticated(saved)).toBe(false)
    const renewed = response()
    expect(auth.authorizeIndex(saved, renewed.value)).toBe(false)
    expect(renewed.state.status).toBe(303)
    const freshCookie = renewed.state.headers?.['set-cookie']?.split(';', 1)[0]
    expect(freshCookie).toBeDefined()
    expect(auth.authorizeIndex({ ...local, headers: { host: '127.0.0.1:3080', cookie: freshCookie } }, response().value)).toBe(true)
  })

  it('recovers an old local launch link without asking for its stale token', async () => {
    const auth = await createAuth(new RecordCredentials())
    const opened = response()
    expect(auth.authorizeIndex({
      ...request('/?token=old-launch', 'localhost:3080'),
      socket: { remoteAddress: '::1' },
    }, opened.value)).toBe(false)
    expect(opened.state.status).toBe(303)
    expect(opened.state.headers?.['set-cookie']).toContain('HttpOnly')
    expect(opened.state.body).toBeUndefined()
  })

  it('keeps remote and cross-site requests outside local automatic login', async () => {
    const auth = await createAuth(new RecordCredentials())
    for (const candidate of [
      { ...request('/', '127.0.0.1:3080'), socket: { remoteAddress: '192.168.1.2' } },
      { ...request('/', 'harness.example:3080'), socket: { remoteAddress: '127.0.0.1' } },
      { ...request('/', '127.0.0.1:3080'), socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3080', origin: 'https://example.com', 'sec-fetch-site': 'cross-site' } },
    ]) {
      const denied = response()
      expect(auth.authorizeIndex(candidate, denied.value)).toBe(false)
      expect(denied.state.status).toBe(401)
      expect(denied.state.headers?.['set-cookie']).toBeUndefined()
    }
  })

  it('recovers a saved desktop login through one same-site navigation without minting a cookie', async () => {
    const auth = await createAuth(new RecordCredentials())
    const { cookie } = exchange(auth)
    const initial = response()
    expect(auth.authorizeIndex(request('/'), initial.value)).toBe(false)
    expect(initial.state.status).toBe(401)
    expect(initial.state.body).toContain('<meta http-equiv="refresh" content="0;url=/?reconnect=1">')
    expect(initial.state.headers?.['set-cookie']).toBeUndefined()

    const resumed = response()
    expect(auth.authorizeIndex(request('/?reconnect=1', 'harness.example:3080', { cookie }), resumed.value)).toBe(false)
    expect(resumed.state.status).toBe(303)
    expect(resumed.state.headers?.location).toBe('/')
    expect(resumed.state.headers?.['set-cookie']).toBeUndefined()
    expect(auth.authorizeIndex(request('/', 'harness.example:3080', { cookie }), response().value)).toBe(true)
  })

  it('stops automatic navigation when there is no saved login and keeps the token form', async () => {
    const auth = await createAuth(new RecordCredentials())
    for (const url of ['/?reconnect=1', '/?token=wrong', '/index.html']) {
      const denied = response()
      expect(auth.authorizeIndex(request(url), denied.value)).toBe(false)
      expect(denied.state.status).toBe(401)
      expect(denied.state.body).not.toContain('http-equiv="refresh"')
      expect(denied.state.body).toContain('<form method="get" action="/">')
      expect(denied.state.headers?.['set-cookie']).toBeUndefined()
    }
  })

  it('lets a desktop window recover its login without an address bar', async () => {
    const auth = await createAuth(new RecordCredentials())
    const denied = response()
    expect(auth.authorizeIndex(request('/'), denied.value)).toBe(false)
    expect(denied.state.status).toBe(401)
    expect(denied.state.headers?.['content-type']).toBe('text/html; charset=utf-8')
    expect(denied.state.body).toContain('<form method="get" action="/">')
    expect(denied.state.body).toContain('name="token"')
    expect(denied.state.body).not.toContain(new URL(auth.authenticatedUrl('http://harness.example:3080')).searchParams.get('token'))
  })

  it('mints one process token and a persistent authority-bound cookie', async () => {
    const store = new RecordCredentials()
    const processOwner = {}
    const first = await createAuth(store, 30, processOwner)
    const login = exchange(first)

    expect(login.state).toMatchObject({
      status: 303,
      headers: {
        'cache-control': 'no-store',
        'location': '/',
        'referrer-policy': 'no-referrer',
      },
    })
    expect(login.state.headers?.['set-cookie']).toMatch(/; Max-Age=2592000; Path=\/; Expires=.*; HttpOnly; SameSite=Strict$/u)
    expect(login.state.headers?.['set-cookie']).not.toContain('Secure')
    expect(first.isAuthenticated(request('/', 'harness.example:3080', { cookie: login.cookie }))).toBe(true)
    expect(first.isAuthenticated({
      headers: new Headers({ host: 'harness.example:3080', cookie: login.cookie }),
    })).toBe(true)
    expect(first.isAuthenticated({ headers: new Headers() })).toBe(false)
    expect(first.isAuthenticated(request('/', 'localhost:3080', { cookie: login.cookie }))).toBe(false)
    expect(first.isAuthenticated(request('/', 'harness.example:3081', { cookie: login.cookie }))).toBe(false)

    const reloaded = await createAuth(store, 30, processOwner)
    expect(reloaded.authenticatedUrl('http://harness.example:3080')).toBe(login.launchUrl)
    expect(reloaded.isAuthenticated(request('/', 'harness.example:3080', { cookie: login.cookie }))).toBe(true)

    const restarted = await createAuth(store)
    expect(new URL(restarted.authenticatedUrl('http://harness.example:3080')).searchParams.get('token'))
      .not.toBe(new URL(login.launchUrl).searchParams.get('token'))
    expect(restarted.isAuthenticated(request('/', 'harness.example:3080', { cookie: login.cookie }))).toBe(true)
    const staleUrl = new URL(login.launchUrl)
    const redirected = response()
    expect(restarted.authorizeIndex(request(
      `${staleUrl.pathname}${staleUrl.search}`,
      'harness.example:3080',
      { cookie: login.cookie },
    ), redirected.value)).toBe(false)
    expect(redirected.state).toEqual({
      status: 303,
      headers: {
        'cache-control': 'no-store',
        'location': '/',
        'referrer-policy': 'no-referrer',
      },
    })
  })

  it('accepts the cookie for index serving and gives every unauthenticated request one response', async () => {
    const auth = await createAuth(new RecordCredentials())
    const { cookie } = exchange(auth)
    const allowed = response()
    expect(auth.authorizeIndex(request('/index.html', 'harness.example:3080', { cookie }), allowed.value)).toBe(true)
    expect(allowed.state).toEqual({})

    for (const candidate of [
      request('/'),
      request('/?token=wrong'),
      request('/?token=wrong&token=again'),
      request('/index.html?token=wrong'),
      request(auth.authenticatedUrl('http://harness.example:3080'), 'harness.example:3080', { method: 'HEAD' }),
    ]) {
      const denied = response()
      expect(auth.authorizeIndex(candidate, denied.value)).toBe(false)
      expect(denied.state.status).toBe(401)
      expect(denied.state.headers).toMatchObject({
        'cache-control': 'no-store',
        'content-type': 'text/html; charset=utf-8',
        'referrer-policy': 'no-referrer',
      })
      if (candidate.method === 'HEAD') expect(denied.state.body).toBeUndefined()
      else expect(denied.state.body).toContain('<form method="get" action="/">')
    }
  })

  it('rejects tampering, expiry, future issuance, and a longer lifetime than configured', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T00:00:00.000Z'))
    const store = new RecordCredentials()
    const auth = await createAuth(store)
    const { cookie } = exchange(auth)
    const [name, value] = cookie.split('=') as [string, string]

    expect(auth.isAuthenticated(request('/', 'harness.example:3080', { cookie: `${name}=broken` }))).toBe(false)
    expect(auth.isAuthenticated(request('/', 'harness.example:3080', { cookie: `${name}=${value.slice(0, -1)}x` }))).toBe(false)
    expect(auth.isAuthenticated(request('/', 'harness.example:3080', { cookie: `${name}=%` }))).toBe(false)
    expect(auth.isAuthenticated(request('/', 'harness.example:3080', {
      cookie: signedBodyCookie(store, name, 'a'),
    }))).toBe(false)
    expect(auth.isAuthenticated({ headers: {} })).toBe(false)
    expect(auth.isAuthenticated({ headers: { host: 'bad host', cookie } })).toBe(false)
    expect(auth.isAuthenticated({ headers: { host: 'harness.example:3080' } })).toBe(false)

    const invalidPayloads: unknown[] = [
      'not json',
      null,
      { version: 2, authority: 'harness.example:3080', issuedAt: Date.now(), expiresAt: Date.now() + 1000 },
      { version: 1, authority: 42, issuedAt: Date.now(), expiresAt: Date.now() + 1000 },
      { version: 1, authority: 'harness.example:3080', issuedAt: 'now', expiresAt: Date.now() + 1000 },
      { version: 1, authority: 'harness.example:3080', issuedAt: Date.now(), expiresAt: 'later' },
    ]
    for (const payload of invalidPayloads) {
      expect(auth.isAuthenticated(request('/', 'harness.example:3080', {
        cookie: signedCookie(store, name, payload),
      }))).toBe(false)
    }

    const shorter = await createAuth(store, 1)
    expect(shorter.isAuthenticated(request('/', 'harness.example:3080', { cookie }))).toBe(false)
    vi.setSystemTime(new Date('2026-09-24T00:00:00.000Z'))
    expect(auth.isAuthenticated(request('/', 'harness.example:3080', { cookie }))).toBe(false)
    vi.setSystemTime(new Date('2026-08-23T00:00:00.000Z'))
    expect(auth.isAuthenticated(request('/', 'harness.example:3080', { cookie }))).toBe(false)
  })

  it('loads one secret per activation and replaces it after deletion on the next activation', async () => {
    const store = new RecordCredentials()
    const auth = await createAuth(store)
    const first = exchange(auth)
    expect(store).toMatchObject({ reads: 0, modifies: 1 })

    await store.deleteRecord()
    expect(auth.isAuthenticated(request('/', 'harness.example:3080', { cookie: first.cookie }))).toBe(true)
    const sameActivation = exchange(auth)
    expect(auth.isAuthenticated(request('/', 'harness.example:3080', { cookie: sameActivation.cookie }))).toBe(true)
    expect(store).toMatchObject({ reads: 0, modifies: 1 })

    const reactivated = await createAuth(store)
    const second = exchange(reactivated)
    expect(second.cookie).not.toBe(first.cookie)
    expect(reactivated.isAuthenticated(request('/', 'harness.example:3080', { cookie: first.cookie }))).toBe(false)
    expect(reactivated.isAuthenticated(request('/', 'harness.example:3080', { cookie: second.cookie }))).toBe(true)
    expect(store).toMatchObject({ reads: 0, modifies: 2 })
  })

  it('fails loud on an invalid owner record instead of replacing it', async () => {
    const unsupported = new RecordCredentials()
    unsupported.record = { kind: 'api-key', key: 'not-a-cookie-secret' }
    await expect(createAuth(unsupported)).rejects.toThrow(/unsupported format/u)

    const malformed = new RecordCredentials()
    malformed.record = { kind: 'grant', payload: { version: 1, secret: 'short' } }
    await expect(createAuth(malformed)).rejects.toThrow(/invalid secret/u)

    const nonString = new RecordCredentials()
    nonString.record = { kind: 'grant', payload: { version: 1, secret: 42 } }
    await expect(createAuth(nonString)).rejects.toThrow(/invalid secret/u)

    const discarded = new RecordCredentials()
    discarded.discardWrites = true
    await expect(createAuth(discarded)).rejects.toThrow(/was not created/u)

    await expect(createAuth(new RecordCredentials(), Number.MAX_SAFE_INTEGER))
      .rejects.toThrow(/safe timestamp range/u)
  })
})

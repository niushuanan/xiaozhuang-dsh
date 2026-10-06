/** The actual local entry stays usable while remote entry still needs a launch grant. */
import { describe, expect, it } from 'vitest'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { BrowserAuth } from '../src/browser-auth.ts'
import type { ConnectionIndexRequest, ConnectionIndexResponse } from '../src/rpc.ts'
import { RecordCredentials } from './browser-credentials.ts'

describe('local browser login', () => {
  it('opens a clean loopback URL, mints a cookie, and accepts the browser follow-up', async () => {
    const auth = await BrowserAuth.create({}, new RecordCredentials() as unknown as CredentialProvider, 30)
    expect(auth.authenticatedUrl('http://127.0.0.1:3080/')).toBe('http://127.0.0.1:3080/')
    const req: ConnectionIndexRequest = { method: 'GET', url: '/', headers: { host: '127.0.0.1:3080' }, socket: { remoteAddress: '127.0.0.1' } }
    let status = 0
    let headers: Readonly<Record<string, string>> = {}
    const res: ConnectionIndexResponse = { writeHead(code, values) { status = code; headers = values ?? {} }, end() {} }
    expect(auth.authorizeIndex(req, res)).toBe(false)
    expect(status).toBe(303)
    expect(headers['location']).toBe('./')
    expect(headers['set-cookie']).toContain('HttpOnly; SameSite=Strict')
    const cookie = headers['set-cookie']?.split(';')[0]
    expect(auth.authorizeIndex({ ...req, headers: { ...req.headers, cookie } }, res)).toBe(true)
  })
  it('keeps remote browser requests behind the current launch-token exchange', async () => {
    const auth = await BrowserAuth.create({}, new RecordCredentials() as unknown as CredentialProvider, 30)
    let status = 0
    const res: ConnectionIndexResponse = { writeHead(code) { status = code }, end() {} }
    const remote: ConnectionIndexRequest = { method: 'GET', url: '/', headers: { host: 'dsh.example' }, socket: { remoteAddress: '192.0.2.10' } }
    expect(auth.authorizeIndex(remote, res)).toBe(false)
    expect(status).toBe(401)
    const url = new URL(auth.authenticatedUrl('http://dsh.example/'))
    expect(url.searchParams.has('token')).toBe(true)
    expect(auth.authorizeIndex({ ...remote, url: url.pathname + url.search }, res)).toBe(false)
    expect(status).toBe(303)
  })
})

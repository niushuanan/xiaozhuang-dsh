import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_API_ROUTE, systemPromptApiHandler,
} from '../src/system-prompt-host.ts'

const homes: string[] = []
afterEach(async () => { await Promise.all(homes.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

function request(method: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, {
    method, url: SYSTEM_PROMPT_API_ROUTE,
    headers: { host: '127.0.0.1:3080', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  }) as unknown as IncomingMessage
}

function response(): { res: ServerResponse; read: () => { status: number; value: Record<string, unknown> } } {
  let body = ''
  const res = { statusCode: 200, setHeader: () => undefined, end: (value?: string | Buffer) => { body = value?.toString() ?? '' } } as unknown as ServerResponse
  return { res, read: () => ({ status: res.statusCode, value: JSON.parse(body) as Record<string, unknown> }) }
}

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-system-prompt-'))
  homes.push(root)
  return root
}

describe('General Settings system prompt host API', () => {
  it('returns the product default before SYSTEM.md exists and saves the first edit', async () => {
    const root = await home()
    const initial = response()
    await systemPromptApiHandler(request('GET'), initial.res, root)
    expect(initial.read()).toMatchObject({ status: 200, value: { exists: false, content: DEFAULT_SYSTEM_PROMPT, revision: 'missing' } })

    const updated = 'You are the product system prompt for {{model}}.'
    const saved = response()
    await systemPromptApiHandler(request('PUT', { content: updated, revision: 'missing' }), saved.res, root)
    expect(saved.read()).toMatchObject({ status: 200, value: { exists: true, content: updated } })
    expect(await readFile(join(root, 'SYSTEM.md'), 'utf8')).toBe(updated)
  })

  it('does not overwrite a concurrent external edit', async () => {
    const root = await home()
    await writeFile(join(root, 'SYSTEM.md'), 'first')
    const loaded = response()
    await systemPromptApiHandler(request('GET'), loaded.res, root)
    await writeFile(join(root, 'SYSTEM.md'), 'external')
    const saved = response()
    await systemPromptApiHandler(request('PUT', { content: 'browser', revision: loaded.read().value.revision }), saved.res, root)
    expect(saved.read().status).toBe(409)
    expect(await readFile(join(root, 'SYSTEM.md'), 'utf8')).toBe('external')
  })
})

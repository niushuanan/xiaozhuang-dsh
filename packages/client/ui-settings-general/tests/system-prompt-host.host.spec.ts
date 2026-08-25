import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_API_ROUTE, systemPromptApiHandler,
} from '../src/system-prompt-host.ts'

const temporaryHomes: string[] = []

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function request(method: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, {
    method,
    url: SYSTEM_PROMPT_API_ROUTE,
    headers: {
      host: '127.0.0.1:3080',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
  }) as unknown as IncomingMessage
}

function response(): { res: ServerResponse; read: () => { status: number; value: Record<string, unknown> } } {
  let body = ''
  const res = {
    statusCode: 200,
    setHeader: () => undefined,
    end: (value?: string | Buffer) => { body = value?.toString() ?? '' },
  } as unknown as ServerResponse
  return {
    res,
    read: () => ({ status: res.statusCode, value: JSON.parse(body) as Record<string, unknown> }),
  }
}

async function dshHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-system-prompt-'))
  temporaryHomes.push(home)
  return home
}

describe('General Settings system prompt host API', () => {
  it('exposes the current product prompt before SYSTEM.md exists, then saves the edit', async () => {
    const home = await dshHome()
    const initial = response()
    await systemPromptApiHandler(request('GET'), initial.res, home)
    expect(initial.read()).toMatchObject({
      status: 200,
      value: {
        path: join(home, 'SYSTEM.md'),
        displayPath: '$DSH_HOME/SYSTEM.md',
        exists: false,
        content: DEFAULT_SYSTEM_PROMPT,
        revision: 'missing',
      },
    })

    const updated = 'You are the product system prompt for {{model}}.'
    const saved = response()
    await systemPromptApiHandler(request('PUT', { content: updated, revision: 'missing' }), saved.res, home)
    expect(saved.read()).toMatchObject({ status: 200, value: { exists: true, content: updated } })
    expect(await readFile(join(home, 'SYSTEM.md'), 'utf8')).toBe(updated)
  })

  it('refuses to overwrite an external edit after the browser loaded', async () => {
    const home = await dshHome()
    await writeFile(join(home, 'SYSTEM.md'), 'first')
    const loaded = response()
    await systemPromptApiHandler(request('GET'), loaded.res, home)
    await writeFile(join(home, 'SYSTEM.md'), 'external')

    const saved = response()
    await systemPromptApiHandler(request('PUT', {
      content: 'browser',
      revision: loaded.read().value.revision,
    }), saved.res, home)
    expect(saved.read().status).toBe(409)
    expect(await readFile(join(home, 'SYSTEM.md'), 'utf8')).toBe('external')
  })

  it('rejects unsupported prompt variables before they can break the next model step', async () => {
    const home = await dshHome()
    const saved = response()
    await systemPromptApiHandler(request('PUT', {
      content: 'Use {{unknown_variable}} now.',
      revision: 'missing',
    }), saved.res, home)

    expect(saved.read()).toMatchObject({
      status: 400,
      value: { error: expect.stringContaining('unknown_variable') },
    })
    await expect(readFile(join(home, 'SYSTEM.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

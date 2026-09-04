import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { GLOBAL_RULES_API_ROUTE, globalRulesApiHandler } from '../src/global-rules-host.ts'

const temporaryHomes: string[] = []

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, {
    method,
    url,
    headers: {
      host: '127.0.0.1:3080',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
  }) as unknown as IncomingMessage
}

function response(): { res: ServerResponse; read: () => { status: number; value: Record<string, unknown> } } {
  let text = ''
  const res = {
    statusCode: 200,
    setHeader: () => undefined,
    end: (value?: string | Buffer) => { text = value?.toString() ?? '' },
  } as unknown as ServerResponse
  return {
    res,
    read: () => ({ status: res.statusCode, value: JSON.parse(text) as Record<string, unknown> }),
  }
}

async function dshHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-global-rules-'))
  temporaryHomes.push(home)
  return home
}

describe('product companion global rules host API', () => {
  it('loads the existing user-global file and returns the saved revision', async () => {
    const home = await dshHome()
    await writeFile(join(home, 'AGENTS.md'), '# Existing global rules\n')
    const first = response()
    await globalRulesApiHandler(request('GET', GLOBAL_RULES_API_ROUTE), first.res, home)
    expect(first.read()).toMatchObject({
      status: 200,
      value: {
        path: join(home, 'AGENTS.md'),
        displayPath: '$DSH_HOME/AGENTS.md',
        exists: true,
        content: '# Existing global rules\n',
      },
    })

    const revision = first.read().value.revision
    const savedContent = '# Existing global rules\n\n- Keep every conversation concise.\n'
    const saved = response()
    await globalRulesApiHandler(request('PUT', GLOBAL_RULES_API_ROUTE, {
      content: savedContent,
      revision,
    }), saved.res, home)
    expect(saved.read()).toMatchObject({
      status: 200,
      value: { exists: true, content: savedContent },
    })
    expect(saved.read().value.revision).toMatch(/^[a-f0-9]{64}$/u)
    expect(await readFile(join(home, 'AGENTS.md'), 'utf8')).toBe(savedContent)
  })

  it('refuses to overwrite an external edit made after the browser loaded', async () => {
    const home = await dshHome()
    await writeFile(join(home, 'AGENTS.md'), 'first version\n')
    const loaded = response()
    await globalRulesApiHandler(request('GET', GLOBAL_RULES_API_ROUTE), loaded.res, home)
    const revision = loaded.read().value.revision
    await writeFile(join(home, 'AGENTS.md'), 'external version\n')

    const write = response()
    await globalRulesApiHandler(request('PUT', GLOBAL_RULES_API_ROUTE, {
      content: 'browser version\n',
      revision,
    }), write.res, home)
    expect(write.read().status).toBe(409)
    expect(await readFile(join(home, 'AGENTS.md'), 'utf8')).toBe('external version\n')
  })

  it('rejects remote callers and never accepts a caller-selected file path', async () => {
    const home = await dshHome()
    await writeFile(join(home, 'AGENTS.md'), 'fixed global rules\n')
    const remoteRequest = request('GET', GLOBAL_RULES_API_ROUTE)
    remoteRequest.headers.host = 'example.com'
    const remote = response()
    await globalRulesApiHandler(remoteRequest, remote.res, home)
    expect(remote.read().status).toBe(403)

    const fixed = response()
    await globalRulesApiHandler(request('GET', `${GLOBAL_RULES_API_ROUTE}?cwd=/tmp/elsewhere`), fixed.res, home)
    expect(fixed.read()).toMatchObject({
      status: 200,
      value: { path: join(home, 'AGENTS.md'), content: 'fixed global rules\n' },
    })
  })
})

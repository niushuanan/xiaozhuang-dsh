import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_RULES_API_ROUTE, projectRulesApiHandler } from '../src/project-rules-host.ts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
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

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-rules-'))
  temporaryRoots.push(root)
  return root
}

describe('product companion project rules host API', () => {
  it('reads a missing file, creates it, and returns the saved revision', async () => {
    const cwd = await project()
    const first = response()
    await projectRulesApiHandler(request('GET', `${PROJECT_RULES_API_ROUTE}?cwd=${encodeURIComponent(cwd)}`), first.res)
    expect(first.read()).toMatchObject({
      status: 200,
      value: { cwd, exists: false, content: '', revision: 'missing' },
    })

    const created = response()
    await projectRulesApiHandler(request('PUT', PROJECT_RULES_API_ROUTE, {
      cwd,
      content: '# Project rules\n\n- Keep the UI simple.\n',
      revision: 'missing',
    }), created.res)
    const saved = created.read()
    expect(saved.status).toBe(200)
    expect(saved.value).toMatchObject({ cwd, exists: true, content: '# Project rules\n\n- Keep the UI simple.\n' })
    expect(saved.value.revision).toMatch(/^[a-f0-9]{64}$/u)
    expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).toBe('# Project rules\n\n- Keep the UI simple.\n')
  })

  it('refuses to overwrite an external edit made after the browser loaded', async () => {
    const cwd = await project()
    await writeFile(join(cwd, 'AGENTS.md'), 'first version\n')
    const loaded = response()
    await projectRulesApiHandler(request('GET', `${PROJECT_RULES_API_ROUTE}?cwd=${encodeURIComponent(cwd)}`), loaded.res)
    const revision = loaded.read().value.revision
    await writeFile(join(cwd, 'AGENTS.md'), 'external version\n')

    const write = response()
    await projectRulesApiHandler(request('PUT', PROJECT_RULES_API_ROUTE, {
      cwd,
      content: 'browser version\n',
      revision,
    }), write.res)
    expect(write.read().status).toBe(409)
    expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).toBe('external version\n')
  })

  it('rejects remote callers and relative project paths', async () => {
    const remoteRequest = request('GET', `${PROJECT_RULES_API_ROUTE}?cwd=${encodeURIComponent('/tmp/project')}`)
    remoteRequest.headers.host = 'example.com'
    const remote = response()
    await projectRulesApiHandler(remoteRequest, remote.res)
    expect(remote.read().status).toBe(403)

    const relative = response()
    await projectRulesApiHandler(request('GET', `${PROJECT_RULES_API_ROUTE}?cwd=relative`), relative.res)
    expect(relative.read().status).toBe(400)
  })
})

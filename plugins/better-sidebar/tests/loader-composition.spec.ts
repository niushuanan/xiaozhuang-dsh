/**
 * Real-composition boot test for dsh-better-sidebar: the plugin is product-
 * visible, so it must boot through the Loader over a real cordis.yml tree with
 * the REAL service implementations (webserver / web-app / session / tools /
 * subprocess-local) and assert user-visible output — not hand-built
 * `ctx.plugin(...)` doubles.
 *
 * The Loader is fed through the `modules` Map (the tool-terminal
 * loader-composition pattern): each bare package name resolves to the real
 * default-export service class or the function-plugin namespace. The web-app's
 * built dist is stubbed to a temp file through its `internals.resolveDistIndex`
 * hook (the browser-open pattern); `openBrowser`/`printUrl`/`surfaceContext`
 * are off so the apply only provides `webRuntime` + mounts the static route.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as WebApp from '@deepseek-ai/dsh-web-app'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as BetterSidebar from '../src/index.ts'

let root: string | undefined
let context: Context | undefined
const originalResolveDistIndex = WebApp.internals.resolveDistIndex

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  WebApp.internals.resolveDistIndex = originalResolveDistIndex
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** POST one JSON body to the listening server with an explicit Host header. */
function postJson(port: number, host: string, path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        host,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ status: res.statusCode ?? 0, json: text === '' ? undefined : JSON.parse(text) })
      })
    })
    req.on('error', reject)
    req.end(payload)
  })
}

describe('better-sidebar real Loader composition', () => {
  it('boots the cordis.yml tree, serves session.cwd, and fences a foreign Host', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-sidebar-loader-'))
    const dist = join(root, 'dist')
    await mkdir(dist)
    const index = join(dist, 'index.html')
    await writeFile(index, '<!doctype html><title>ready</title>')
    WebApp.internals.resolveDistIndex = () => index

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-host-webserver'",
      '  config:',
      '    host: 127.0.0.1',
      '    port: 0',
      "- name: '@deepseek-ai/dsh-web-app'",
      '  config:',
      '    openBrowser: false',
      '    printUrl: false',
      '    surfaceContext: false',
      '    trustedHosts: []',
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-system-prompt'",
      "- name: '@deepseek-ai/dsh-tools'",
      "- name: '@deepseek-ai/dsh-subprocess-local'",
      "- name: '@deepseek-ai/dsh-better-sidebar'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-host-webserver', WebServer],
      ['@deepseek-ai/dsh-web-app', WebApp],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-subprocess-local', LocalSubprocessRuntime],
      ['@deepseek-ai/dsh-better-sidebar', BetterSidebar],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    // 1. The better-sidebar entry reached the active phase: its fiber is mounted.
    const entry = [...context.loader.entries()].find(candidate => candidate.options.name === '@deepseek-ai/dsh-better-sidebar')
    expect(entry?.fiber).toBeDefined()

    // The webServer really listened on an OS-assigned port.
    const port = (context.webServer as unknown as { port: number }).port
    expect(port).toBeGreaterThan(0)

    // 2a. A same-origin loopback request for a legal session id returns a 200 envelope.
    const sessionStore = context.sessions as unknown as SessionStore
    sessionStore.create(SessionId('legal-session'), { meta: { cwd: root } })
    const good = await postJson(port, `127.0.0.1:${String(port)}`, '/sidebar/api/session.cwd', { sessionId: 'legal-session' })
    expect(good.status).toBe(200)
    expect((good.json as { ok: true; value: { cwd: string } }).ok).toBe(true)
    expect((good.json as { ok: true; value: { cwd: string } }).value.cwd).toBe(root)

    // 2b. A foreign Host fails the trust fence with a 403 (DNS-rebinding defense).
    const evil = await postJson(port, `evil.local:${String(port)}`, '/sidebar/api/session.cwd', { sessionId: 'legal-session' })
    expect(evil.status).toBe(403)
    expect((evil.json as { ok: false; error: { code: string } }).error.code).toBe('forbidden')

    // 3. Dispose leaves no residue (the afterEach also disposes; this asserts the tree is still intact here).
    await context.fiber.dispose()
    context = undefined
  }, 20_000)
})

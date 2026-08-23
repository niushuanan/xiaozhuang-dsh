/**
 * Native DSH Computer Use: Qwen desktop actions, Playwright isolation, and a
 * paired Chrome-extension bridge, activated per agent by slash commands.
 * @module @deepseek-ai/dsh-computer-use
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import { BrowserBridge } from './bridge.ts'
import { BrowserRuntime, IsolatedBrowserRuntime } from './browsers.ts'
import { DesktopRuntime } from './desktop.ts'
import { registerBrowserTools, registerDesktopTools } from './tools.ts'
import type { BrowserMode, ComputerUseConfig, ComputerUseStatus } from './types.ts'

export type * from './types.ts'

/** Durable Settings namespace shared by the Host runtime and Web section. */
export const COMPUTER_USE_SETTINGS_NAMESPACE = settingsNamespace('computer-use')

declare module '@deepseek-ai/cordis' {
  interface Context {
    computerUse: ComputerUseRuntime
  }
}

/** Native Computer Use plugin config; every field is user-editable in Settings. */
export const Config: z<ComputerUseConfig> = z.object({
  desktopEnabled: z.boolean().default(true),
  browserEnabled: z.boolean().default(true),
  defaultBrowserMode: z.union([z.const('isolated'), z.const('connected')]).default('isolated'),
  connectedBrowserNewTab: z.boolean().default(true),
})

/** Host runtime owning native providers, routes, slash commands, and agent-local tools. */
export class ComputerUseRuntime extends Service {
  static inject = ['commands', 'tools', 'webServer']
  static Config = Config

  private source: () => ComputerUseConfig
  private readonly desktop: DesktopRuntime
  private bridge!: BrowserBridge
  private browsers!: BrowserRuntime
  private extensionPath = ''
  private token = ''
  private readonly desktopAgents = new WeakSet<Agent>()
  private readonly browserAgents = new WeakSet<Agent>()
  private readonly browserModes = new WeakMap<Agent, BrowserMode>()

  constructor(ctx: Context, config: ComputerUseConfig) {
    super(ctx, 'computerUse')
    this.source = () => config
    this.desktop = new DesktopRuntime(ctx)
    installSettingsSection(ctx, COMPUTER_USE_SETTINGS_NAMESPACE, Config, config, {
      setSource: (source) => { this.source = source },
      onChange: () => {},
    })
  }

  async [Service.init](): Promise<void> {
    const home = resolveDshHome()
    const stateRoot = join(home, 'computer-use')
    this.extensionPath = join(home, 'browser-bridge-extension')
    await mkdir(stateRoot, { recursive: true, mode: 0o700 })
    this.token = await loadOrCreateToken(join(stateRoot, 'bridge-token'))
    await installExtension(this.extensionPath)
    this.bridge = new BrowserBridge(this.token)
    this.browsers = new BrowserRuntime(
      new IsolatedBrowserRuntime(),
      this.bridge,
      () => this.source().connectedBrowserNewTab,
    )

    this.ctx.effect(() => this.ctx.webServer.registerUpgrade({
      path: '/computer-use/bridge',
      handler: (req, socket, head) => { this.bridge.upgrade(req, socket, head) },
    }), 'computer-use: Chrome bridge upgrade')
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact', path: '/computer-use/status',
      handler: (req, res) => this.statusRoute(req, res),
    }), 'computer-use: status route')
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact', path: '/computer-use/setup-desktop',
      handler: (req, res) => this.setupRoute(req, res),
    }), 'computer-use: desktop setup route')
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact', path: '/computer-use/open-extension',
      handler: (req, res) => this.openExtensionRoute(req, res),
    }), 'computer-use: extension folder route')
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact', path: '/computer-use/workspace',
      handler: (req, res) => this.workspaceRoute(req, res),
    }), 'computer-use: browser workspace route')
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact', path: '/computer-use/workspace/screenshot',
      handler: (req, res) => this.workspaceScreenshotRoute(req, res),
    }), 'computer-use: browser workspace screenshot route')
    this.ctx.effect(() => this.ctx.webServer.register({
      kind: 'exact', path: '/computer-use/workspace/action',
      handler: (req, res) => this.workspaceActionRoute(req, res),
    }), 'computer-use: browser workspace action route')

    this.ctx.effect(() => this.ctx.commands.register({
      name: 'computer',
      description: '用 Computer Use 操作本机应用',
      input: { hint: '<要完成的桌面任务>' },
      handler: ({ agent, rawInput }) => this.computerCommand(agent, rawInput),
    }), 'computer-use: /computer command')
    this.ctx.effect(() => this.ctx.commands.register({
      name: 'browser',
      description: '用隔离浏览器或已连接的 Chrome 完成网页任务',
      input: { hint: '[isolated|real] <要完成的网页任务>' },
      handler: ({ agent, rawInput }) => this.browserCommand(agent, rawInput),
    }), 'computer-use: /browser command')

    this.ctx.on('session/disposed', (session) => { void this.browsers.closeSession(String(session.id)) })
    this.ctx.effect(() => async () => {
      await Promise.allSettled([this.desktop.dispose(), this.browsers.dispose()])
      this.bridge.dispose()
    }, 'computer-use: providers')
  }

  /**
   * Read current desktop permissions and both browser-provider connection states.
   * @returns The live status projected to the loopback-only Settings route.
   */
  async status(): Promise<ComputerUseStatus> {
    const desktop = await this.desktop.status()
    const bridge = this.bridge.status
    return {
      desktop,
      isolatedBrowser: { available: this.browsers.isolated.available },
      connectedBrowser: {
        ...bridge,
        extensionPath: this.extensionPath,
        pairingCode: `ws://127.0.0.1:${String(this.ctx.webServer.port)}/computer-use/bridge#${this.token}`,
      },
    }
  }

  private computerCommand(agent: Agent, rawInput: string) {
    const task = rawInput.trim()
    if (!this.source().desktopEnabled) {
      return { kind: 'error' as const, text: '桌面 Computer Use 已在设置中关闭。' }
    }
    if (task === '') return { kind: 'error' as const, text: '请输入要在桌面完成的任务，例如：/computer 打开备忘录并新建一条记录' }
    if (!this.desktopAgents.has(agent)) {
      registerDesktopTools(agent, this.ctx, this.desktop)
      this.desktopAgents.add(agent)
    }
    agent.steer(createUserMessage({
      content: [{
        type: 'text',
        text: `Use the native computer_* tools to complete this desktop task: ${task}. Start with computer_get_state, prefer stable element_index actions, and issue only one element-targeted desktop action at a time. Use the refreshed indices returned after every action; if the user moves, hides, or minimizes the app, continue from the refreshed state instead of an old screen position. Use coordinate drag only when accessibility actions cannot express the gesture. Stop when the requested user-visible result is confirmed.`,
      }],
      source: { kind: 'user' },
    }))
    return { kind: 'success' as const, text: 'Computer Use 已开始执行。' }
  }

  private browserCommand(agent: Agent, rawInput: string) {
    if (!this.source().browserEnabled) {
      return { kind: 'error' as const, text: '浏览器控制已在设置中关闭。' }
    }
    const parsed = parseBrowserCommand(rawInput, this.source().defaultBrowserMode)
    if (parsed.task === '') {
      return { kind: 'error' as const, text: '请输入网页任务，例如：/browser isolated 打开官网并找到安装说明' }
    }
    this.browserModes.set(agent, parsed.mode)
    if (!this.browserAgents.has(agent)) {
      registerBrowserTools(agent, this.ctx, this.browsers, current => this.browserModes.get(current) ?? this.source().defaultBrowserMode)
      this.browserAgents.add(agent)
    }
    const surface = parsed.mode === 'isolated' ? 'a clean isolated Playwright session' : 'the user-authorized existing Chrome profile'
    agent.steer(createUserMessage({
      content: [{
        type: 'text',
        text: `Use the native browser_* tools with ${surface} to complete this task: ${parsed.task}. Inspect the DOM refs and screenshot after each action, preserve unrelated tabs, and stop only after confirming the visible result.`,
      }],
      source: { kind: 'user' },
    }))
    return {
      kind: 'success' as const,
      text: parsed.mode === 'isolated' ? '隔离浏览器已开始执行。' : '真实 Chrome 已开始执行。',
    }
  }

  private async statusRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, 'GET', res)) return
    json(res, 200, await this.status())
  }

  private setupRoute(req: IncomingMessage, res: ServerResponse): void {
    if (!allowLoopback(req, 'POST', res)) return
    this.desktop.setup()
    json(res, 202, { ok: true })
  }

  private openExtensionRoute(req: IncomingMessage, res: ServerResponse): void {
    if (!allowLoopback(req, 'POST', res)) return
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open'
    const child = spawn(command, [this.extensionPath], { detached: true, stdio: 'ignore' })
    child.unref()
    json(res, 202, { ok: true })
  }

  private workspaceRoute(req: IncomingMessage, res: ServerResponse): void {
    if (!allowLoopback(req, 'GET', res)) return
    const sessionId = requestUrl(req).searchParams.get('sessionId')?.trim() ?? ''
    if (sessionId === '') {
      json(res, 400, { error: 'sessionId is required' })
      return
    }
    json(res, 200, {
      state: this.browsers.workspaceState(sessionId),
      enabled: this.source().browserEnabled,
    })
  }

  private workspaceScreenshotRoute(req: IncomingMessage, res: ServerResponse): void {
    if (!allowLoopback(req, 'GET', res)) return
    const sessionId = requestUrl(req).searchParams.get('sessionId')?.trim() ?? ''
    const screenshot = sessionId === '' ? undefined : this.browsers.workspaceScreenshot(sessionId)
    if (screenshot === undefined) {
      json(res, 404, { error: 'no browser screenshot' })
      return
    }
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': String(screenshot.byteLength),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(screenshot)
  }

  private async workspaceActionRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!allowLoopback(req, 'POST', res)) return
    if (!this.source().browserEnabled) {
      json(res, 409, { error: 'browser control is disabled' })
      return
    }
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) })
      return
    }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const mode = body.mode === 'connected' ? 'connected' : body.mode === 'isolated' ? 'isolated' : undefined
    const action = typeof body.action === 'string' ? body.action : ''
    const args = isRecord(body.args) ? body.args : {}
    if (sessionId === '' || mode === undefined || action === '') {
      json(res, 400, { error: 'sessionId, mode, and action are required' })
      return
    }
    try {
      const state = await this.browsers.control(mode, action, sessionId, args, AbortSignal.timeout(30_000))
      json(res, 200, { state })
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export default ComputerUseRuntime

/**
 * Parse `/browser`'s optional provider word while preserving the task text.
 * @param rawInput Full command text after the `/browser` token.
 * @param fallback Provider selected in Settings when no mode word is present.
 * @returns The resolved browser mode and unmodified task request.
 */
export function parseBrowserCommand(rawInput: string, fallback: BrowserMode): { mode: BrowserMode; task: string } {
  const trimmed = rawInput.trim()
  const [head, ...rest] = trimmed.split(/\s+/u)
  if (head === 'isolated') return { mode: 'isolated', task: rest.join(' ') }
  if (head === 'real' || head === 'connected') return { mode: 'connected', task: rest.join(' ') }
  return { mode: fallback, task: trimmed }
}

async function installExtension(target: string): Promise<void> {
  const source = fileURLToPath(new URL('../assets/browser-bridge', import.meta.url))
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, force: true })
}

async function loadOrCreateToken(path: string): Promise<string> {
  try {
    const existing = (await readFile(path, 'utf8')).trim()
    if (existing.length >= 24) return existing
  } catch {
    // First activation creates the local pairing secret below.
  }
  const token = randomBytes(24).toString('base64url')
  await writeFile(path, `${token}\n`, { mode: 0o600 })
  await chmod(path, 0o600)
  return token
}

function allowLoopback(req: IncomingMessage, method: 'GET' | 'POST', res: ServerResponse): boolean {
  const address = req.socket.remoteAddress ?? ''
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  if (!loopback || req.method !== method) {
    json(res, loopback ? 405 : 403, { error: loopback ? 'method not allowed' : 'loopback only' })
    return false
  }
  return true
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://127.0.0.1')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > 64 * 1024) throw new Error('request body is too large')
    chunks.push(buffer)
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (!isRecord(parsed)) throw new Error('request body must be an object')
  return parsed
}

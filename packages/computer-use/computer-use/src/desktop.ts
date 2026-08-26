import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

/** Parsed macOS permission state returned by open-computer-use. */
export interface DesktopPermissionStatus {
  installed: boolean
  accessibility: 'granted' | 'missing' | 'unknown'
  screenRecording: 'granted' | 'missing' | 'unknown'
}

/** Raw upstream result projected by the native DSH tools. */
export interface DesktopCallResult {
  text: string
  image?: { data: string; mimeType: string }
}

interface DesktopElementTarget {
  index: string
  id?: string
  signature: string
}

const ELEMENT_TARGETED_ACTIONS = new Set(['click', 'perform_secondary_action', 'scroll', 'set_value'])
/** Keep permission readers behind one result until an explicit setup can change it. */
export class DesktopPermissionCache {
  private cached: DesktopPermissionStatus | undefined
  private inflight: Promise<DesktopPermissionStatus> | undefined

  constructor(private readonly probe: () => Promise<DesktopPermissionStatus>) {}

  read(): Promise<DesktopPermissionStatus> {
    if (this.cached !== undefined) return Promise.resolve(this.cached)
    this.inflight ??= this.probe().then((value) => {
      this.cached = value
      return value
    }).finally(() => { this.inflight = undefined })
    return this.inflight
  }

  invalidate(): void {
    this.cached = undefined
  }
}

/** Lazy, single-lease Qwen Open Computer Use client. */
export class DesktopRuntime {
  private client: Client | undefined
  private connecting: Promise<Client> | undefined
  private owner: string | undefined
  private readonly bin: string | undefined
  private actionTail: Promise<void> = Promise.resolve()
  private readonly snapshots = new Map<string, string>()
  private readonly permissions: DesktopPermissionCache

  constructor(ctx: Context) {
    this.bin = resolveOpenComputerUseBin()
    this.permissions = new DesktopPermissionCache(() => this.readStatus())
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'turn/end' || session.id !== this.owner) return
      this.owner = undefined
      const client = this.client
      if (client !== undefined) {
        void client.notification({ method: 'notifications/turn-ended' }).catch(() => {})
      }
    })
  }

  /**
   * Inspect availability and native authorization without opening system prompts.
   * @returns Installed state plus live macOS accessibility and screen-recording permissions.
   */
  async status(): Promise<DesktopPermissionStatus> {
    return this.permissions.read()
  }

  private async readStatus(): Promise<DesktopPermissionStatus> {
    if (this.bin === undefined) {
      return { installed: false, accessibility: 'unknown', screenRecording: 'unknown' }
    }
    try {
      const output = await runNodeBin(this.bin, ['permission-status'], 5_000)
      const accessibility = /accessibility=granted/u.test(output) ? 'granted'
        : /accessibility=missing/u.test(output) ? 'missing' : 'unknown'
      const screenRecording = /screenRecording=granted/u.test(output) ? 'granted'
        : /screenRecording=missing/u.test(output) ? 'missing' : 'unknown'
      return { installed: true, accessibility, screenRecording }
    } catch {
      return { installed: true, accessibility: 'unknown', screenRecording: 'unknown' }
    }
  }

  /** Open upstream's official permission onboarding without blocking DSH. */
  setup(): void {
    if (this.bin === undefined) throw new Error('Qwen Open Computer Use is not installed in this DSH build')
    this.permissions.invalidate()
    const child = spawn(process.execPath, [this.bin, 'doctor'], {
      detached: true,
      env: screenshotEnv(),
      stdio: 'ignore',
    })
    child.once('exit', () => { this.permissions.invalidate() })
    child.unref()
  }

  /**
   * Execute one upstream Qwen action under the global desktop lease.
   * @param session DSH session requesting desktop ownership.
   * @param name Native Qwen Open Computer Use tool name.
   * @param args Upstream tool arguments.
   * @param signal Cancellation signal inherited from tool execution.
   * @returns Projected text and optional screenshot content.
   */
  async call(session: Session, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<DesktopCallResult> {
    const sessionId = String(session.id)
    if (this.owner !== undefined && this.owner !== sessionId) {
      throw new Error('另一条 DSH 会话正在控制桌面；请等待它当前这一轮结束后再试')
    }
    this.owner = sessionId
    const app = typeof args.app === 'string' ? args.app : undefined
    const target = app === undefined ? undefined : plannedElementTarget(name, args, this.snapshots.get(app))
    const run = this.actionTail.then(async () => {
      signal.throwIfAborted()
      const nextArgs = { ...args }
      if (app !== undefined && target !== undefined) {
        const live = await this.request('get_app_state', { app }, signal)
        this.snapshots.set(app, live.text)
        nextArgs.element_index = resolveLiveElementIndex(live.text, target)
      }
      const result = await this.request(name, nextArgs, signal)
      if (app !== undefined && result.text !== '') this.snapshots.set(app, result.text)
      return result
    })
    this.actionTail = run.then(() => undefined, () => undefined)
    return run
  }

  private async request(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<DesktopCallResult> {
    const client = await this.connect()
    const response = await client.request(
      { method: 'tools/call', params: { name, arguments: args } },
      CallToolResultSchema,
      { signal, timeout: 60_000 },
    )
    const text: string[] = []
    let image: DesktopCallResult['image']
    for (const block of response.content) {
      if (block.type === 'text') text.push(block.text)
      if (block.type === 'image') image = { data: block.data, mimeType: block.mimeType }
    }
    if (response.isError === true) throw new Error(text.join('\n') || `open-computer-use ${name} failed`)
    return { text: text.join('\n'), ...image === undefined ? {} : { image } }
  }

  /** Close the upstream MCP client and release the desktop lease. */
  async dispose(): Promise<void> {
    const client = this.client
    this.client = undefined
    this.connecting = undefined
    this.owner = undefined
    this.actionTail = Promise.resolve()
    this.snapshots.clear()
    await client?.close()
  }

  private connect(): Promise<Client> {
    if (this.client !== undefined) return Promise.resolve(this.client)
    if (this.connecting !== undefined) return this.connecting
    if (this.bin === undefined) return Promise.reject(new Error('Qwen Open Computer Use is not installed in this DSH build'))
    const client = new Client(
      { name: 'deepseek-harness-computer-use', version: '0.1.1' },
      { capabilities: {} },
    )
    this.connecting = client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [this.bin, 'mcp'],
      env: screenshotEnv(),
    })).then(() => {
      this.client = client
      this.connecting = undefined
      client.onclose = () => {
        if (this.client === client) this.client = undefined
      }
      return client
    }, (error: unknown) => {
      this.connecting = undefined
      throw error
    })
    return this.connecting
  }
}

/** Capture one snapshot-scoped index as a stable accessibility target. */
export function captureElementTarget(snapshot: string, index: string): DesktopElementTarget {
  const element = parseSnapshotElements(snapshot).find(candidate => candidate.index === index)
  if (element === undefined) {
    throw new Error(`元素 ${index} 不在当前应用状态中，请先重新调用 computer_get_state`)
  }
  return element
}

/** Resolve a planned accessibility target against the application's live tree. */
export function resolveLiveElementIndex(snapshot: string, target: DesktopElementTarget): string {
  const elements = parseSnapshotElements(snapshot)
  if (target.id !== undefined) {
    const matches = elements.filter(element => element.id === target.id)
    const match = matches[0]
    if (matches.length === 1 && match !== undefined) return match.index
  }
  const matches = elements.filter(element => element.signature === target.signature)
  const match = matches[0]
  if (matches.length === 1 && match !== undefined) return match.index
  throw new Error('应用界面已变化，目标元素已不可唯一定位；请重新调用 computer_get_state 后再操作')
}

function plannedElementTarget(
  name: string,
  args: Record<string, unknown>,
  snapshot: string | undefined,
): DesktopElementTarget | undefined {
  if (!ELEMENT_TARGETED_ACTIONS.has(name) || args.element_index === undefined) return undefined
  if (snapshot === undefined) throw new Error('元素操作前必须先调用 computer_get_state 获取当前应用状态')
  const index = args.element_index
  if (typeof index !== 'string' && typeof index !== 'number') {
    throw new Error('element_index 必须是文字或数字')
  }
  return captureElementTarget(snapshot, String(index))
}

function parseSnapshotElements(snapshot: string): DesktopElementTarget[] {
  const elements: DesktopElementTarget[] = []
  for (const line of snapshot.split('\n')) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/u.exec(line)
    if (match === null) continue
    const index = match[1]
    const signature = match[2]
    if (index === undefined || signature === undefined) continue
    const id = /(?:^|\s)ID:\s*([^,]+?)(?=,\s|$)/u.exec(signature)?.[1]?.trim()
    elements.push({ index, signature, ...id === undefined ? {} : { id } })
  }
  return elements
}

function screenshotEnv(): Record<string, string> {
  return {
    ...scrubbedParentEnv(),
    OPEN_COMPUTER_USE_IMAGE_MAX_DIMENSION: '1280',
    OPEN_COMPUTER_USE_IMAGE_MAX_BYTES: '900000',
  }
}

function resolveOpenComputerUseBin(): string | undefined {
  const require = createRequire(import.meta.url)
  try {
    const packageJson = require.resolve('@qwen-code/open-computer-use/package.json')
    return `${dirname(packageJson)}/bin/open-computer-use`
  } catch {
    return undefined
  }
}

function runNodeBin(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      env: screenshotEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('open-computer-use command timed out'))
    }, timeoutMs)
    timer.unref()
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(`${stdout}\n${stderr}`)
      else reject(new Error(stderr.trim() || `open-computer-use exited with code ${String(code)}`))
    })
  })
}

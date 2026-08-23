import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import type { BrowserActionResult, BrowserWorkspaceTab } from './types.ts'

interface PendingRequest {
  resolve: (value: BrowserActionResult) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface BridgeHello {
  type: 'hello'
  token: string
  version: string
  browser?: string
}

interface BridgeResult {
  type: 'result'
  requestId: string
  ok: boolean
  result?: { text?: string; screenshot?: string; tabs?: BrowserWorkspaceTab[] }
  error?: string
}

type ExtensionMessage = BridgeHello | BridgeResult

/** One authenticated Chrome-extension connection and its request/reply queue. */
export class BrowserBridge {
  private readonly server = new WebSocketServer({ noServer: true })
  private socket: WebSocket | undefined
  private browser: string | undefined
  private version: string | undefined
  private readonly pending = new Map<string, PendingRequest>()

  constructor(private readonly token: string) {}

  /** Current authenticated extension connection metadata. */
  get status(): { connected: boolean; browser?: string; version?: string } {
    return {
      connected: this.socket?.readyState === WebSocket.OPEN,
      ...this.browser === undefined ? {} : { browser: this.browser },
      ...this.version === undefined ? {} : { version: this.version },
    }
  }

  /**
   * Upgrade a loopback Chrome-extension request into the single live bridge.
   * @param req Incoming HTTP upgrade request.
   * @param socket Duplex network socket to authenticate and adopt.
   * @param head Bytes already read after the HTTP upgrade headers.
   */
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const origin = req.headers.origin
    if (typeof origin !== 'string' || !origin.startsWith('chrome-extension://')) {
      socket.destroy()
      return
    }
    this.server.handleUpgrade(req, socket, head, (client) => {
      let authenticated = false
      const authTimer = setTimeout(() => { client.close(4001, 'pairing required') }, 5_000)
      authTimer.unref()
      client.on('message', (payload) => {
        let message: ExtensionMessage
        try {
          message = JSON.parse(payload.toString()) as ExtensionMessage
        } catch {
          client.close(4002, 'invalid message')
          return
        }
        if (!authenticated) {
          if (message.type !== 'hello' || message.token !== this.token) {
            client.close(4003, 'pairing rejected')
            return
          }
          clearTimeout(authTimer)
          authenticated = true
          this.socket?.close(4000, 'replaced by a newer DSH Browser Bridge connection')
          this.socket = client
          this.version = message.version
          this.browser = message.browser
          client.send(JSON.stringify({ type: 'hello-accepted' }))
          return
        }
        if (message.type === 'result') this.settle(message)
      })
      client.once('close', () => {
        clearTimeout(authTimer)
        if (this.socket !== client) return
        this.socket = undefined
        this.browser = undefined
        this.version = undefined
        this.rejectAll(new Error('DSH Browser Bridge disconnected'))
      })
    })
  }

  /**
   * Send one task-scoped browser action to the paired extension.
   * @param action Stable browser action name.
   * @param sessionId DSH session that owns the controlled tab set.
   * @param args Action-specific serializable arguments.
   * @param signal Cancellation signal inherited from tool execution.
   * @returns DOM text and an optional visible-page screenshot.
   */
  request(action: string, sessionId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<BrowserActionResult> {
    const socket = this.socket
    if (socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('真实浏览器尚未连接，请先在设置 → Computer Use 中完成 Chrome 配对'))
    }
    const requestId = crypto.randomUUID()
    return new Promise<BrowserActionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`DSH Browser Bridge action "${action}" timed out`))
      }, 30_000)
      timer.unref()
      const onAbort = (): void => {
        clearTimeout(timer)
        this.pending.delete(requestId)
        reject(signal.reason instanceof Error ? signal.reason : new Error('browser action aborted'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.pending.set(requestId, {
        timer,
        resolve: (value) => {
          signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
        reject: (error) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        },
      })
      socket.send(JSON.stringify({ type: 'request', requestId, action, sessionId, args }))
    })
  }

  /** Close the live extension connection and reject outstanding actions. */
  dispose(): void {
    this.socket?.close(1001, 'DSH shutting down')
    this.rejectAll(new Error('DSH Browser Bridge disposed'))
    this.server.close()
  }

  private settle(message: BridgeResult): void {
    const pending = this.pending.get(message.requestId)
    if (pending === undefined) return
    this.pending.delete(message.requestId)
    clearTimeout(pending.timer)
    if (!message.ok) {
      pending.reject(new Error(message.error ?? 'DSH Browser Bridge action failed'))
      return
    }
    const screenshot = message.result?.screenshot
    pending.resolve({
      text: message.result?.text ?? '',
      ...message.result?.tabs === undefined ? {} : { tabs: message.result.tabs },
      ...screenshot === undefined ? {} : { screenshot: Buffer.from(screenshot, 'base64') },
    })
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }
}

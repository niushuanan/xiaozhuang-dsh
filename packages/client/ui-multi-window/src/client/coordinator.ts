import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  auxiliaryDshWindowUrl, currentDshWindowContext,
} from '@deepseek-ai/dsh-client-runtime/client'

export const MAX_DSH_WINDOWS = 4
const LEASE_PREFIX = 'dsh.multi-window.lease.'
const PRIMARY_ID_KEY = 'dsh.multi-window.primary-id'
const LEASE_TTL_MS = 7_000
const HEARTBEAT_MS = 2_000

export interface MultiWindowSnapshot {
  count: number
  atLimit: boolean
}

export type OpenWindowResult = 'opened' | 'limit' | 'blocked'

interface LeaseStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface MultiWindowEnvironment {
  storage: LeaseStorage
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>
  href: () => string
  screen: () => { width: number; height: number }
  open: (url: string, target: string, features: string) => Window | null
  now: () => number
  randomId: () => string
  setInterval: (callback: () => void, delay: number) => number
  clearInterval: (id: number) => void
  addEventListener: (type: 'storage' | 'pagehide', listener: EventListener) => void
  removeEventListener: (type: 'storage' | 'pagehide', listener: EventListener) => void
}

function browserEnvironment(): MultiWindowEnvironment {
  return {
    storage: localStorage,
    sessionStorage,
    href: () => location.href,
    screen: () => ({ width: window.screen.availWidth, height: window.screen.availHeight }),
    open: (url, target, features) => window.open(url, target, features),
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
    setInterval: (callback, delay) => window.setInterval(callback, delay),
    clearInterval: (id) => { window.clearInterval(id) },
    addEventListener: (type, listener) => { window.addEventListener(type, listener) },
    removeEventListener: (type, listener) => { window.removeEventListener(type, listener) },
  }
}

function windowId(environment: MultiWindowEnvironment): string {
  const context = currentDshWindowContext()
  if (context.role === 'auxiliary' && context.windowId !== undefined) {
    environment.sessionStorage.setItem(PRIMARY_ID_KEY, context.windowId)
    return context.windowId
  }
  const existing = environment.sessionStorage.getItem(PRIMARY_ID_KEY)
  if (existing !== null && existing !== '') return existing
  const created = environment.randomId()
  environment.sessionStorage.setItem(PRIMARY_ID_KEY, created)
  return created
}

/** Shared lease-based coordinator: closed windows age out, live windows heartbeat. */
export class MultiWindowCoordinator {
  private readonly listeners = new Set<() => void>()
  private readonly id: string
  private snapshot: MultiWindowSnapshot = { count: 1, atLimit: false }
  private timer: number | undefined
  private started = false

  constructor(private readonly environment: MultiWindowEnvironment = browserEnvironment()) {
    this.id = windowId(environment)
  }

  readonly getSnapshot = (): MultiWindowSnapshot => this.snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private readonly onSharedState = (): void => { this.refresh() }
  private readonly onPageHide = (): void => { this.release() }
  private leaseKey(id = this.id): string { return `${LEASE_PREFIX}${id}` }

  start(): () => void {
    if (this.started) return () => { this.stop() }
    this.started = true
    this.heartbeat()
    this.environment.addEventListener('storage', this.onSharedState)
    this.environment.addEventListener('pagehide', this.onPageHide)
    this.timer = this.environment.setInterval(() => { this.heartbeat() }, HEARTBEAT_MS)
    return () => { this.stop() }
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    if (this.timer !== undefined) this.environment.clearInterval(this.timer)
    this.timer = undefined
    this.environment.removeEventListener('storage', this.onSharedState)
    this.environment.removeEventListener('pagehide', this.onPageHide)
    this.release()
  }

  openSession(sessionId: SessionId): OpenWindowResult {
    this.refresh()
    if (this.snapshot.atLimit) return 'limit'
    const id = this.environment.randomId()
    const pendingKey = this.leaseKey(id)
    this.environment.storage.setItem(pendingKey, String(this.environment.now()))
    this.refresh()
    const { width: screenWidth, height: screenHeight } = this.environment.screen()
    const width = Math.min(screenWidth, Math.max(620, Math.floor(screenWidth * 0.52)))
    const height = Math.min(screenHeight, Math.max(640, Math.floor(screenHeight * 0.9)))
    const offset = Math.min(this.snapshot.count - 1, 3) * 28
    const left = Math.max(0, Math.floor((screenWidth - width) / 2) + offset)
    const top = Math.max(0, Math.floor((screenHeight - height) / 2) + offset)
    const url = auxiliaryDshWindowUrl(this.environment.href(), id, sessionId)
    const opened = this.environment.open(
      url,
      `dsh-window-${id}`,
      `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
    )
    if (opened === null) {
      this.environment.storage.removeItem(pendingKey)
      this.refresh()
      return 'blocked'
    }
    return 'opened'
  }

  private heartbeat(): void {
    this.environment.storage.setItem(this.leaseKey(), String(this.environment.now()))
    this.refresh()
  }

  private release(): void {
    this.environment.storage.removeItem(this.leaseKey())
    this.refresh()
  }

  private refresh(): void {
    const now = this.environment.now()
    let count = 0
    for (let index = this.environment.storage.length - 1; index >= 0; index--) {
      const key = this.environment.storage.key(index)
      if (key === null || !key.startsWith(LEASE_PREFIX)) continue
      const updatedAt = Number(this.environment.storage.getItem(key))
      if (!Number.isFinite(updatedAt) || now - updatedAt > LEASE_TTL_MS) {
        this.environment.storage.removeItem(key)
        continue
      }
      count++
    }
    const next = { count, atLimit: count >= MAX_DSH_WINDOWS }
    if (next.count === this.snapshot.count && next.atLimit === this.snapshot.atLimit) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

export const MAX_DSH_PANES = 4
/** Compatibility export for profiles that still import the old technical name. */
export const MAX_DSH_WINDOWS = MAX_DSH_PANES
const STORAGE_KEY = 'dsh.multi-pane.sessions'

export interface ConversationPane {
  readonly paneId: string
  readonly sessionId: SessionId
}

export interface MultiPaneSnapshot {
  readonly panes: readonly ConversationPane[]
  readonly currentSessionId?: SessionId
  readonly count: number
  readonly atLimit: boolean
}

/** Compatibility alias retained for existing plugin consumers. */
export type MultiWindowSnapshot = MultiPaneSnapshot
export type OpenPaneResult = 'opened' | 'visible' | 'limit'
/** Compatibility alias retained for existing plugin consumers. */
export type OpenWindowResult = OpenPaneResult

export interface MultiPaneEnvironment {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  randomId: () => string
  setSplitActive: (active: boolean) => void
}

/** Compatibility alias retained for existing plugin consumers. */
export type MultiWindowEnvironment = MultiPaneEnvironment

function browserEnvironment(): MultiPaneEnvironment {
  return {
    storage: localStorage,
    randomId: () => crypto.randomUUID(),
    setSplitActive: (active) => {
      if (active) document.documentElement.dataset.dshSplitPanes = 'true'
      else delete document.documentElement.dataset.dshSplitPanes
    },
  }
}

function readPanes(storage: MultiPaneEnvironment['storage']): readonly ConversationPane[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.flatMap((item): ConversationPane[] => {
      if (typeof item !== 'object' || item === null) return []
      const paneId = Reflect.get(item, 'paneId')
      const sessionId = Reflect.get(item, 'sessionId')
      return typeof paneId === 'string' && paneId !== '' && typeof sessionId === 'string' && sessionId !== ''
        ? [{ paneId, sessionId: sessionId as SessionId }]
        : []
    }).slice(0, MAX_DSH_PANES - 1)
  } catch {
    return []
  }
}

/** Owns the page's secondary conversation panes and their persisted identities. */
export class MultiPaneCoordinator {
  private readonly listeners = new Set<() => void>()
  private started = false
  private snapshot: MultiPaneSnapshot

  constructor(private readonly environment: MultiPaneEnvironment = browserEnvironment()) {
    const panes = readPanes(environment.storage)
    this.snapshot = { panes, count: 1 + panes.length, atLimit: 1 + panes.length >= MAX_DSH_PANES }
  }

  readonly getSnapshot = (): MultiPaneSnapshot => this.snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start(): () => void {
    this.started = true
    this.environment.setSplitActive(this.snapshot.panes.length > 0)
    return () => { this.stop() }
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.environment.setSplitActive(false)
  }

  sync(currentSessionId: SessionId | undefined, validSessionIds: ReadonlySet<SessionId>): void {
    const seen = new Set<SessionId>()
    const panes = this.snapshot.panes.filter((pane) => {
      if (!validSessionIds.has(pane.sessionId) || pane.sessionId === currentSessionId || seen.has(pane.sessionId)) return false
      seen.add(pane.sessionId)
      return true
    }).slice(0, MAX_DSH_PANES - 1)
    this.publish(panes, currentSessionId)
  }

  openSession(sessionId: SessionId): OpenPaneResult {
    if (sessionId === this.snapshot.currentSessionId
      || this.snapshot.panes.some(pane => pane.sessionId === sessionId)) return 'visible'
    if (this.snapshot.atLimit) return 'limit'
    const panes = [...this.snapshot.panes, { paneId: this.environment.randomId(), sessionId }]
    this.publish(panes, this.snapshot.currentSessionId)
    return 'opened'
  }

  closePane(paneId: string): void {
    this.publish(
      this.snapshot.panes.filter(pane => pane.paneId !== paneId),
      this.snapshot.currentSessionId,
    )
  }

  private publish(panes: readonly ConversationPane[], currentSessionId: SessionId | undefined): void {
    const unchanged = currentSessionId === this.snapshot.currentSessionId
      && panes.length === this.snapshot.panes.length
      && panes.every((pane, index) => {
        const previous = this.snapshot.panes[index]
        return previous?.paneId === pane.paneId && previous.sessionId === pane.sessionId
      })
    if (unchanged) return
    this.snapshot = {
      panes,
      ...(currentSessionId === undefined ? {} : { currentSessionId }),
      count: 1 + panes.length,
      atLimit: 1 + panes.length >= MAX_DSH_PANES,
    }
    this.environment.storage.setItem(STORAGE_KEY, JSON.stringify(panes))
    if (this.started) this.environment.setSplitActive(panes.length > 0)
    for (const listener of this.listeners) listener()
  }
}

/** Compatibility class name retained while the product moves from windows to panes. */
export class MultiWindowCoordinator extends MultiPaneCoordinator {}

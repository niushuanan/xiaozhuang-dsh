/**
 * Agent-terminal bridge: a READ-ONLY mirror of the official host terminal seam
 * (`ctx.terminals`, `@deepseek-ai/dsh-terminal`) into the sidebar. The model's
 * `terminal_*` tools (`@deepseek-ai/dsh-tool-terminal`) create persistent
 * terminal sessions in that service; this bridge snapshots each live agent's
 * terminals and pushes the list to the sidebar over the
 * `/sidebar/ws/agent-terminal-mirror` socket, and backs the fenced
 * `agent-terminal.read` / `agent-terminal.close` API methods.
 *
 * The sidebar never sends input through this bridge (no startSend): the model
 * owns the interactive send seam exclusively, so a user keystroke can never
 * race a `terminal_send` (which the service rejects with SEND_ACTIVE while one
 * is in flight). The mirror is therefore output-only: `read` pages scrollback
 * and `close` releases a terminal (the same verb the model's `terminal_close`
 * uses), both gated on the terminal actually belonging to the calling session's
 * live agent.
 *
 * Trigger strategy — BOTH mechanisms run, for complementary reasons:
 * - EVENT-DRIVEN: the official terminal tools append `tool/call` / `tool/result`
 *   session events; a `terminal_*` one schedules a re-snapshot so create/close
 *   converge immediately (a `tool/result` for `terminal_open`/`terminal_close`
 *   fires only AFTER the service published/removed the session, so the
 *   snapshot is already authoritative).
 * - POLLING (2s): a terminal's top-level process can EXIT asynchronously with
 *   no tool call in flight, and that status change has no session event; the
 *   poll catches it. The tick is a cheap no-op unless live agents exist.
 */
import type {
  Context,
  SidebarAgent,
  SidebarAgentsService,
  SidebarTerminalReadResult,
  SidebarTerminalSnapshot,
  SidebarTerminalsService,
} from './context-types.ts'
import { SidebarError } from './wire.ts'

/** Wire snapshot of one mirrored terminal (client-facing, extensible). */
export interface AgentTerminalMirrorSnapshot {
  /** The official terminal handle (the model's `terminal_*` sessionId, e.g. `pty-1`). */
  terminalId: string
  /** Owner-local display name (the model's `name`, e.g. `main`); absent when unnamed. */
  name?: string
  /** Backend type that created the session. */
  type: string
  /** Top-level process id when the backend exposes one. */
  pid?: number
  /** Whether the top-level process has exited (scrollback stays readable). */
  exited: boolean
  /** Exit code once known (present only after exit). */
  exitCode?: number | null
  /** Exit signal name once known (present only after a signal kill). */
  exitSignal?: string | null
}

/** Read result of one mirrored terminal: the scrollback page plus the live
 *  status (the sidebar's status line reads it on every poll). */
export interface AgentTerminalReadResult extends SidebarTerminalReadResult {
  /** Whether the top-level process has exited. */
  exited: boolean
  /** Exit code once known (present only after exit). */
  exitCode?: number | null
  /** Exit signal name once known (present only after a signal kill). */
  exitSignal?: string | null
}

/** Poll interval for the async-exit liveness sweep. */
const POLL_INTERVAL_MS = 2000

/** One live terminal session of the official seam, projected to the wire shape. */
function project(snapshot: SidebarTerminalSnapshot): AgentTerminalMirrorSnapshot {
  const out: AgentTerminalMirrorSnapshot = {
    terminalId: snapshot.sessionId,
    type: snapshot.type,
    exited: snapshot.status.kind === 'exited',
  }
  if (snapshot.name !== undefined) out.name = snapshot.name
  if (snapshot.pid !== undefined) out.pid = snapshot.pid
  if (snapshot.status.kind === 'exited') {
    out.exitCode = snapshot.status.exitCode
    out.exitSignal = snapshot.status.signal
  }
  return out
}

/** Stable serialization of a session's mirror list (the diff key). */
function keyOf(list: readonly AgentTerminalMirrorSnapshot[]): string {
  return JSON.stringify(list)
}

/** Whether a session event is a terminal-tool call/result (drives re-snapshot). */
function isTerminalEvent(event: { type: string; data: unknown }): boolean {
  if (event.type !== 'tool/call' && event.type !== 'tool/result') return false
  const name = (event.data as { name?: unknown } | null | undefined)?.name
  return typeof name === 'string' && name.startsWith('terminal_')
}

/**
 * The agent-terminal mirror bridge. Constructed per plugin activation; call
 * {@link start} (inside a `ctx.effect`) to begin the triggers and receive the
 * disposer that stops them.
 */
export class AgentTerminalBridge {
  private readonly listeners = new Set<() => void>()
  private readonly lastBySession = new Map<string, string>()
  private resnapshotScheduled = false
  private disposed = false

  constructor(private readonly ctx: Context) {}

  /** Resolve the optional live-agent registry. */
  private agents(): SidebarAgentsService | undefined {
    return this.ctx.get('agents') as SidebarAgentsService | undefined
  }

  /** Resolve the optional official terminal-session service. */
  private terminals(): SidebarTerminalsService | undefined {
    return this.ctx.get('terminals') as SidebarTerminalsService | undefined
  }

  /** The current mirror list for one conversation session (empty when absent). */
  list(sessionId: string): AgentTerminalMirrorSnapshot[] {
    const agents = this.agents()
    const terminals = this.terminals()
    if (agents === undefined || terminals === undefined) return []
    const agent = agents.get(sessionId)
    if (agent === undefined) return []
    return terminals.list(agent).map(project)
  }

  /**
   * Begin the event subscription and the liveness poll.
   * @returns the disposer that stops both and drops retained diff state.
   */
  start(): () => void {
    const offSessionEvent = typeof this.ctx.on === 'function'
      ? this.ctx.on('session/event', (_session, event) => {
        if (isTerminalEvent(event)) this.scheduleResnapshot()
      })
      : () => { /* test doubles without the event API rely on the poll */ }
    const timer = setInterval(() => { this.resnapshotIfLiveAgents() }, POLL_INTERVAL_MS)
    if (typeof timer === 'object' && 'unref' in timer) (timer as { unref(): void }).unref()
    return () => {
      this.disposed = true
      offSessionEvent()
      clearInterval(timer)
      this.listeners.clear()
      this.lastBySession.clear()
    }
  }

  /**
   * Resolve one terminal owned by the session's live agent, or throw
   * `not-found`. A terminal belonging to another session is indistinguishable
   * from an unknown one — the same denial the official tool seam applies.
   */
  private ownedTerminal(
    sessionId: string,
    terminalId: string,
  ): { agent: SidebarAgent; terminals: SidebarTerminalsService } {
    const agents = this.agents()
    const terminals = this.terminals()
    if (agents === undefined || terminals === undefined) {
      throw new SidebarError('not-found', `agent terminal "${terminalId}" not found`, 404)
    }
    const agent = agents.get(sessionId)
    if (agent === undefined) {
      throw new SidebarError('not-found', `agent terminal "${terminalId}" not found`, 404)
    }
    const owned = terminals.list(agent).some(snapshot => snapshot.sessionId === terminalId)
    if (!owned) {
      throw new SidebarError('not-found', `agent terminal "${terminalId}" not found`, 404)
    }
    return { agent, terminals }
  }

  /**
   * Read one bounded scrollback page from an owned terminal.
   * @param sessionId - the conversation session whose live agent owns the terminal.
   * @param terminalId - the official terminal handle.
   * @param offset - optional newest-relative offset (backend-owned default).
   * @param count - optional requested line count (backend limits still apply).
   */
  read(sessionId: string, terminalId: string, offset?: number, count?: number): AgentTerminalReadResult {
    const { agent, terminals } = this.ownedTerminal(sessionId, terminalId)
    const result = terminals.read(agent, terminalId, {
      ...(offset === undefined ? {} : { offset }),
      ...(count === undefined ? {} : { count }),
    })
    const snapshot = terminals.list(agent).find(candidate => candidate.sessionId === terminalId)
    const out: AgentTerminalReadResult = { ...result, exited: snapshot?.status.kind === 'exited' }
    if (snapshot?.status.kind === 'exited') {
      out.exitCode = snapshot.status.exitCode
      out.exitSignal = snapshot.status.signal
    }
    return out
  }

  /**
   * Close (release) an owned terminal and await quiescence.
   * @returns whether a live terminal was actually dropped.
   */
  async close(sessionId: string, terminalId: string): Promise<{ closed: boolean }> {
    const { agent, terminals } = this.ownedTerminal(sessionId, terminalId)
    const closed = await terminals.close(agent, terminalId, 'sidebar tab closed')
    // Push the removal immediately (the poll would catch it within 2s; this
    // makes the close converge the mirror view without the delay).
    this.resnapshotAll()
    return { closed }
  }

  /** Subscribe to mirror changes (any session's list changed). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Re-snapshot every live agent's terminals now and notify subscribers only
   * when a session's list actually changed (the diff). Exposed for the poll
   * tick, the close fast-path, and deterministic tests.
   */
  refresh(): void {
    this.resnapshotAll()
  }

  /** Debounce one event-driven re-snapshot to a single sweep per batch. */
  private scheduleResnapshot(): void {
    if (this.disposed || this.resnapshotScheduled) return
    this.resnapshotScheduled = true
    queueMicrotask(() => {
      this.resnapshotScheduled = false
      if (!this.disposed) this.resnapshotAll()
    })
  }

  /** Poll tick: sweep only while at least one live agent owns the seam. */
  private resnapshotIfLiveAgents(): void {
    const agents = this.agents()
    if (agents === undefined || agents.list().length === 0) return
    this.resnapshotAll()
  }

  /** Re-snapshot every live agent's terminals and notify on any diff. */
  private resnapshotAll(): void {
    const agents = this.agents()
    const terminals = this.terminals()
    if (agents === undefined || terminals === undefined) return
    const seen = new Set<string>()
    let changed = false
    for (const agent of agents.list()) {
      const sessionId = String(agent.id)
      seen.add(sessionId)
      const key = keyOf(terminals.list(agent).map(project))
      if (this.lastBySession.get(sessionId) !== key) {
        this.lastBySession.set(sessionId, key)
        changed = true
      }
    }
    // Drop sessions whose agent is gone so a stale diff key never lingers.
    for (const sessionId of [...this.lastBySession.keys()]) {
      if (!seen.has(sessionId)) {
        this.lastBySession.delete(sessionId)
        changed = true
      }
    }
    if (changed) this.notify()
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // A throwing listener must not break the others or the sweep.
      }
    }
  }
}

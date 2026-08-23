/**
 * Session-header preset switching.
 *
 * A pick made during a running turn is retained per session and committed once
 * the shared session summary reports idle. The Host owns the matching idle
 * transaction, so navigating away cannot cancel a queued switch and a stale
 * client cannot recompose an active turn.
 */

import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import {
  createSnapshotStore, type SessionId, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import { messageOf } from './settings-store.ts'

/** Header switch state for one session. */
export interface AgentPresetSessionSwitchEntry {
  /** Preset accepted by the UI but not yet confirmed by the Host. */
  readonly pending?: string
  /** Whether the Host call is in flight. */
  readonly busy: boolean
  /** Last non-transient failure, cleared by the next pick. */
  readonly error: string | null
}

/** Reactive state shared by every mounted session header. */
export interface AgentPresetSessionSwitchState {
  readonly bySession: Readonly<Record<string, AgentPresetSessionSwitchEntry>>
}

/** Session facts needed to decide whether a switch can start. */
export interface SwitchableSessionSummary {
  readonly id: SessionId
  readonly running: boolean
  readonly agentPreset?: string
}

const INITIAL: AgentPresetSessionSwitchState = { bySession: {} }

/** Queue and commit per-session preset switches without interrupting turns. */
export class AgentPresetSessionSwitchController {
  readonly store: SnapshotStore<AgentPresetSessionSwitchState> = createSnapshotStore(INITIAL)

  constructor(
    private readonly api: Pick<IApiClient, 'agentPresets'>,
    private readonly session: (sessionId: SessionId) => SwitchableSessionSummary | undefined,
    private readonly onApplied: (sessionId: SessionId, agentPreset: string) => void,
  ) {}

  private entry(sessionId: SessionId): AgentPresetSessionSwitchEntry | undefined {
    return this.store.getSnapshot().bySession[sessionId]
  }

  private set(sessionId: SessionId, entry: AgentPresetSessionSwitchEntry): void {
    const state = this.store.getSnapshot()
    this.store.set({ bySession: { ...state.bySession, [sessionId]: entry } })
  }

  private clear(sessionId: SessionId): void {
    const state = this.store.getSnapshot()
    if (state.bySession[sessionId] === undefined) return
    const bySession = Object.fromEntries(
      Object.entries(state.bySession).filter(([id]) => id !== sessionId),
    )
    this.store.set({ bySession })
  }

  /**
   * Accept a header-menu pick and commit it immediately when the session is idle.
   * A running session retains the pick until a later list update reports idle.
   * @param sessionId - session whose next turn uses the new preset.
   * @param agentPreset - selected preset id.
   * @returns after an immediate Host attempt settles, or immediately when queued.
   */
  async select(sessionId: SessionId, agentPreset: string): Promise<void> {
    const current = this.session(sessionId)
    const entry = this.entry(sessionId)
    if (entry?.busy === true) return
    if (current?.agentPreset === agentPreset) {
      this.clear(sessionId)
      return
    }
    this.set(sessionId, { pending: agentPreset, busy: false, error: null })
    await this.flush(sessionId)
  }

  /** Retry every queued switch whose session may have become idle. */
  flushAll(): void {
    for (const sessionId of Object.keys(this.store.getSnapshot().bySession)) {
      void this.flush(sessionId as SessionId)
    }
  }

  /** Fold a committed owner event into this browser's pending state. */
  confirm(sessionId: SessionId, agentPreset: string): void {
    if (this.entry(sessionId)?.pending === agentPreset) this.clear(sessionId)
  }

  private async flush(sessionId: SessionId): Promise<void> {
    const queued = this.entry(sessionId)
    const agentPreset = queued?.pending
    if (agentPreset === undefined || queued?.busy === true) return
    const session = this.session(sessionId)
    if (session === undefined) {
      this.clear(sessionId)
      return
    }
    if (session.agentPreset === agentPreset) {
      this.clear(sessionId)
      return
    }
    if (session.running) return

    this.set(sessionId, { pending: agentPreset, busy: true, error: null })
    try {
      const response = await this.api.agentPresets.select({ sessionId, agentPreset })
      if (!response.result.ok) {
        // The session may have started after the browser read `running:false`.
        // Keep the pick and let the next idle summary retry it.
        if (response.result.error.code === 'agent-preset-locked') {
          this.set(sessionId, { pending: agentPreset, busy: false, error: null })
          return
        }
        this.set(sessionId, { busy: false, error: response.result.error.message })
        return
      }
      this.clear(sessionId)
      this.onApplied(sessionId, response.result.value.agentPreset)
    } catch (error) {
      this.set(sessionId, { busy: false, error: messageOf(error) })
    }
  }
}

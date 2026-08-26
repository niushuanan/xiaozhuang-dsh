/** Quiet-period, cursor-incremental upkeep of the AI memory document. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-query'
import type { MemoryModelRequest, MemoryModelResult, MemoryRoute } from './model.ts'
import { generateMemoryWithLlm, PLUGIN_AI_ROUTE } from './model.ts'
import { batchConversationEvidence, collectConversationChanges, maintainMemoryDocument } from './maintenance.ts'
import type { MemoryDocumentStore } from './store.ts'
import type { MaintenanceOutcome, MemoryState } from './types.ts'

/** Deployment-tunable upkeep timing for {@link IdleMemoryScheduler}. */
export interface IdleUpkeepConfig {
  /** Quiet span a contributing conversation must reach before its evidence is curated. */
  readonly idleDelayMs: number
}

/** One maintenance model call: the framed request in, the parsed replacement out. */
export type MemoryGenerator = (input: {
  readonly request: MemoryModelRequest
  readonly route: MemoryRoute
}) => Promise<MemoryModelResult>

/** The store slice upkeep actually touches: state cursors plus the living AI document. */
type UpkeepStore = Pick<MemoryDocumentStore, 'read' | 'readState' | 'write' | 'writeState'>

/**
 * Maintains `ai.md` from recorded conversations using one monotonic time cursor
 * instead of a wall-clock schedule. Triggers are conversation silence (any session
 * event restarts the quiet timer), a startup backfill over everything missed while
 * DSH was not running, and an explicit user request. Passes run serially; extra
 * triggers while one pass runs coalesce into exactly one follow-up pass.
 *
 * Scheduled passes only curate events older than `idleDelayMs`, so evidence enters
 * memory strictly after its conversation went quiet; explicit passes include up to
 * the current instant. The cursor advances — and any persisted failure note clears —
 * only after every model batch of the window commits, so a failed window retries in
 * full on the next trigger without dropping evidence.
 *
 * @param ctx - Host context supplying the session query, logger, and LLM route.
 * @param store - The memory slice this scheduler reads documents and state from.
 * @param config - Quiet-span timing for scheduled passes.
 * @param generate - Model adapter; defaults to the product flash route.
 */
export class IdleMemoryScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined
  private cycle: Promise<MaintenanceOutcome> | undefined
  private queued = false
  private stopped = false
  private readonly ctx: Context
  private readonly store: UpkeepStore
  private readonly config: IdleUpkeepConfig
  private readonly generate: MemoryGenerator

  constructor(
    ctx: Context,
    store: UpkeepStore,
    config: IdleUpkeepConfig,
    generate?: MemoryGenerator,
  ) {
    this.ctx = ctx
    this.store = store
    this.config = config
    this.generate = generate ?? (input => generateMemoryWithLlm(ctx, input.request))
  }

  /** Subscribe to the session event bus so any activity defers the quiet deadline.
   *
   * @returns The listener disposer for effect registration.
   */
  listen(): () => void {
    return this.ctx.on('session/event', () => { this.armQuietTimer() })
  }

  /** Backfill everything missed while DSH was not running, then keep idle-watching.
   *
   * @returns The scheduler disposer, which stops accepting triggers and clears the timer.
   */
  start(): () => void {
    this.requestCycle()
    return () => {
      this.stopped = true
      if (this.timer !== undefined) clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  /** Run one immediate pass through the current instant; report `busy` if one is active.
   *
   * @returns The pass outcome, or the `busy` outcome when a pass already runs.
   */
  organizeNow(): Promise<MaintenanceOutcome> {
    if (this.stopped || this.cycle !== undefined) return Promise.resolve({ status: 'busy' })
    const cycle = this.runPass('explicit')
    this.cycle = cycle.finally(() => {
      this.cycle = undefined
    })
    return cycle
  }

  private requestCycle(): void {
    if (this.stopped) return
    if (this.cycle !== undefined) {
      this.queued = true
      return
    }
    const cycle = this.runPass('scheduled')
    this.cycle = cycle.finally(() => {
      this.cycle = undefined
      if (this.queued && !this.stopped) {
        this.queued = false
        this.requestCycle()
      }
    })
  }

  private armQuietTimer(): void {
    if (this.stopped) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    // A late fire after host sleep still runs: the quiet condition is relative,
    // so unlike an absolute wall-clock deadline there is nothing to miss.
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.requestCycle()
    }, this.config.idleDelayMs)
  }

  private async runPass(mode: 'scheduled' | 'explicit'): Promise<MaintenanceOutcome> {
    let state: MemoryState
    try {
      state = await this.store.readState()
    } catch (error) {
      this.ctx.logger.warn(`memory-system: maintenance state is unreadable: ${errorMessage(error)}`)
      return { status: 'failed', message: errorMessage(error) }
    }
    try {
      const outcome = await this.maintainWindow(state.lastMaintenanceCursor, mode)
      // Rewriting the whole canonical shape both advances the cursor and drops
      // any previous failure note; `lastMaintenanceAt` keeps meaning success time.
      await this.store.writeState({
        lastMaintenanceCursor: outcome.throughCursor,
        lastMaintenanceAt: new Date().toISOString(),
        lastProvider: PLUGIN_AI_ROUTE.provider,
        lastModel: PLUGIN_AI_ROUTE.model,
      })
      return outcome.result
    } catch (error) {
      // The untouched cursor inside `state` makes the next trigger retry this window.
      await this.store.writeState({
        ...state,
        lastMaintenanceError: { at: new Date().toISOString(), message: errorMessage(error) },
      }).catch(() => undefined)
      this.ctx.logger.warn(`memory-system: ai-memory maintenance failed: ${errorMessage(error)}`)
      return { status: 'failed', message: errorMessage(error) }
    }
  }

  private async maintainWindow(
    fromCursor: number,
    mode: 'scheduled' | 'explicit',
  ): Promise<{ result: MaintenanceOutcome; throughCursor: number }> {
    // Scheduled passes stop at the quiet horizon so brand-new conversations are
    // never curated mid-flight; explicit passes deliberately reach the present.
    const horizon = mode === 'explicit'
      ? Date.now() - 1
      : Date.now() - this.config.idleDelayMs - 1
    const throughCursor = Math.max(fromCursor, horizon)
    if (throughCursor <= fromCursor) return { result: { status: 'empty' }, throughCursor: fromCursor }
    const conversations = await collectConversationChanges(this.ctx.sessionQuery, fromCursor, throughCursor)
    let result: MaintenanceOutcome = { status: 'empty' }
    for (const batch of batchConversationEvidence(conversations)) {
      const maintained = await maintainMemoryDocument({
        store: this.store,
        kind: 'ai',
        source: { conversations: batch, fromCursor, throughCursor },
        route: PLUGIN_AI_ROUTE,
        generate: args => this.generate({ request: args.request, route: args.route }),
      })
      result = {
        status: 'completed',
        changed: maintained.changed,
        summary: maintained.summary,
        revision: maintained.revision,
      }
    }
    return { result, throughCursor }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

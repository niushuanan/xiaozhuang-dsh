import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { MemoryModelRequest, MemoryModelResult } from '../src/model.ts'
import { IdleMemoryScheduler } from '../src/scheduler.ts'
import type { MemoryDocumentView, MemoryState } from '../src/store.ts'

const IDLE_DELAY_MS = 300_000
const BASE_TIME = 1_700_000_000_000

interface HarnessOptions {
  readonly initial?: Partial<MemoryState>
  /** Attach `listen()` and the startup backfill immediately (production shape). */
  readonly autoAttach?: boolean
}

interface Harness {
  readonly scheduler: IdleMemoryScheduler
  /** Simulate one session-bus event: any activity restarts the quiet timer. */
  readonly activity: () => void
  readonly attach: () => void
  readonly disposeAll: () => void
  readonly windows: Array<{ from: number; through: number }>
  readonly generate: ReturnType<typeof vi.fn<(request: MemoryModelRequest) => Promise<MemoryModelResult>>>
  readonly setCollectFailure: (error: Error | undefined) => void
  readonly currentState: () => MemoryState
  readonly history: readonly MemoryState[]
}

function buildHarness(options: HarnessOptions = {}): Harness {
  const { initial = {}, autoAttach = true } = options
  vi.useFakeTimers({ now: BASE_TIME })
  let listener: (() => void) | undefined
  let state: MemoryState = { lastMaintenanceCursor: 0, ...initial }
  const history: MemoryState[] = []
  const windows: Harness['windows'] = []
  let collectFailure: Error | undefined
  let documentContent = ''
  let documentRevision = 'missing'

  const generate = vi.fn(async (_request: MemoryModelRequest): Promise<MemoryModelResult> => ({
    document: `${documentContent}新增一条记忆。\n`,
    summary: '合并重复并新增一条',
  }))

  const store = {
    async readState(): Promise<MemoryState> { return state },
    async writeState(next: MemoryState): Promise<void> {
      state = next
      history.push(next)
    },
    async read(): Promise<MemoryDocumentView> {
      return {
        kind: 'ai', path: '/dsh/memory/ai.md', exists: documentContent !== '',
        content: documentContent, revision: documentRevision, canRestore: true,
      }
    },
    async write(_kind: 'user' | 'ai', content: string): Promise<MemoryDocumentView> {
      documentContent = content
      documentRevision = `rev-${history.length}`
      return {
        kind: 'ai', path: '/dsh/memory/ai.md', exists: true,
        content: documentContent, revision: documentRevision, canRestore: true,
      }
    },
  }

  const ctx = {
    logger: { warn: vi.fn() },
    sessionQuery: {
      listSessions: vi.fn(async () => [{ header: { id: 's1', cwd: '/work/dsh' } }]),
      filterEvents: vi.fn(async (
        _id: string,
        filters: Array<{ kind: string; from?: number; to?: number }>,
      ) => {
        const timeFilter = filters.find(filter => filter.kind === 'time')
        windows.push({ from: timeFilter?.from ?? 0, through: timeFilter?.to ?? 0 })
        if (collectFailure !== undefined) throw collectFailure
        return [{
          sessionId: 's1', seq: 7, time: 640_000,
          type: 'user/message', surface: 'current', text: '偏好先跑定向测试再发布',
        }]
      }),
    },
    on: (_name: string, callback: () => void) => {
      listener = callback
      return () => { listener = undefined }
    },
  }

  const scheduler = new IdleMemoryScheduler(
    ctx as unknown as Context,
    store,
    { idleDelayMs: IDLE_DELAY_MS },
    input => generate(input.request),
  )

  const disposers: Array<() => void> = []
  if (autoAttach) disposers.push(scheduler.listen(), scheduler.start())

  return {
    scheduler,
    activity: () => { listener?.() },
    attach: () => { disposers.push(scheduler.listen(), scheduler.start()) },
    disposeAll: () => { for (const dispose of disposers.splice(0)) dispose() },
    windows,
    generate,
    setCollectFailure: (error) => { collectFailure = error },
    currentState: () => state,
    history,
  }
}

async function settle(rounds = 10): Promise<void> {
  // Fake timers capture the session-yield `setImmediate` inside evidence
  // collection, so pumping must drive the clock — plain microtask awaits stall.
  for (let round = 0; round < rounds; round += 1) await vi.advanceTimersByTimeAsync(1)
}

describe('IdleMemoryScheduler', () => {
  afterEach(() => { vi.useRealTimers() })

  it('backfills everything missed while DSH was not running, stopping at the quiet horizon', async () => {
    const app = buildHarness({ initial: { lastMaintenanceCursor: 400_000 } })

    await settle()

    expect(app.windows[0]?.from).toBe(400_001)
    expect(app.windows[0]?.through).toBeGreaterThan(BASE_TIME - IDLE_DELAY_MS - 60)
    expect(app.windows[0]?.through).toBeLessThanOrEqual(BASE_TIME - IDLE_DELAY_MS - 1)
    expect(app.currentState().lastMaintenanceCursor).toBe(app.windows[0]?.through)
    expect(app.currentState().lastMaintenanceAt).toBeTypeOf('string')
    expect(app.currentState().lastMaintenanceError).toBeUndefined()
    app.disposeAll()
  })

  it('curates a conversation only after it stays quiet for the configured span', async () => {
    // A cursor at "now" makes the startup backfill an empty no-op window,
    // so every recorded pass below comes from the quiet timer alone.
    const app = buildHarness({ initial: { lastMaintenanceCursor: BASE_TIME } })
    let passesAtLastActivity = 0

    app.activity()
    await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS - 60_000)
    app.activity()
    await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS - 60_000)
    passesAtLastActivity = app.windows.length
    await vi.advanceTimersByTimeAsync(59_000)
    expect(app.windows.slice(passesAtLastActivity)).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1_100)
    await settle()
    expect(app.windows.slice(passesAtLastActivity)).toHaveLength(1)
    const quietPass = app.windows.at(-1)
    expect(quietPass?.from).toBe(BASE_TIME + 1)
    expect(app.generate).toHaveBeenCalledTimes(1)
    expect(app.currentState().lastMaintenanceCursor).toBe(quietPass?.through)
    app.disposeAll()
  })

  it('keeps the cursor and records the failure when a pass throws, then retries that whole window', async () => {
    const app = buildHarness({ initial: { lastMaintenanceCursor: 500 } })

    app.setCollectFailure(new Error('api key 无效'))
    await settle()

    expect(app.currentState().lastMaintenanceCursor).toBe(500)
    expect(app.currentState().lastMaintenanceError).toMatchObject({ message: 'api key 无效' })
    expect(app.generate).not.toHaveBeenCalled()
    expect(app.currentState().lastProvider).toBeUndefined()

    app.setCollectFailure(undefined)
    app.activity()
    await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS + 1)
    await settle()

    // Both attempts cover the identical uncommitted window.
    expect(app.generate).toHaveBeenCalledTimes(1)
    expect(app.windows).toHaveLength(2)
    for (const attempt of app.windows) expect(attempt.from).toBe(501)
    const retry = app.windows.at(-1)
    expect(retry?.through).toBeGreaterThan(500)
    expect(app.currentState().lastMaintenanceCursor).toBe(retry?.through)
    expect(app.currentState().lastMaintenanceError).toBeUndefined()
    app.disposeAll()
  })

  it('includes brand-new messages in an explicit pass and reports busy while one is running', async () => {
    const app = buildHarness({ autoAttach: false })
    let releaseGenerate: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { releaseGenerate = resolve })
    app.generate.mockImplementationOnce(async () => {
      await gate
      return { document: '已整理', summary: '包含刚刚的对话' }
    })

    const running = app.scheduler.organizeNow()
    expect(await app.scheduler.organizeNow()).toEqual({ status: 'busy' })

    releaseGenerate?.()
    await settle()
    expect(await running).toMatchObject({ status: 'completed', changed: true })
    expect(app.windows[0]?.from).toBe(1)
    // Explicit passes reach the current instant instead of stopping at the quiet horizon.
    expect(app.windows[0]?.through).toBeGreaterThanOrEqual(BASE_TIME - 1)
    expect(app.windows[0]?.through).toBeLessThan(Date.now() + 1)
    expect(app.currentState().lastMaintenanceCursor).toBe(app.windows[0]?.through)
  })

  it('coalesces triggers arriving during a running pass into exactly one queued follow-up', async () => {
    const app = buildHarness()
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    let calls = 0
    app.generate.mockImplementation(async () => {
      calls += 1
      if (calls === 1) {
        await firstGate
        return { document: '第一批整理完成', summary: '沉淀首批' }
      }
      return { document: '第二批整理完成', summary: '沉淀后续' }
    })

    await settle()
    expect(calls).toBe(1)

    app.activity()
    app.activity()
    await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS + 1)
    await settle()
    expect(calls).toBe(1)

    releaseFirst?.()
    await settle()
    expect(calls).toBe(2)
    await vi.advanceTimersByTimeAsync(IDLE_DELAY_MS + 1)
    await settle()
    expect(calls).toBe(2)
    app.disposeAll()
  })
})

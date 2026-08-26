/** Atomic durable state for the external adaptive-update worker. */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isActiveUpdatePhase, type UpdatePhase, type UpdateSnapshot } from './types.ts'

const STATE_FILE = 'state.json'
const COMMIT = /^[a-f0-9]{40}$/u
const PHASES = new Set<UpdatePhase>([
  'discovering', 'reviewing', 'adapting', 'validating', 'waiting-for-idle',
  'applying', 'completed', 'failed', 'rolled-back',
])

function invalidState(): Error {
  return new Error('invalid continuous adaptation state')
}

function parseState(value: unknown): UpdateSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidState()
  const state = value as Partial<UpdateSnapshot>
  if (state.schemaVersion !== 1
    || typeof state.phase !== 'string' || !PHASES.has(state.phase as UpdatePhase)
    || typeof state.jobId !== 'string' || state.jobId === ''
    || typeof state.workerPid !== 'number' || !Number.isInteger(state.workerPid) || state.workerPid <= 0
    || typeof state.currentCommit !== 'string' || !COMMIT.test(state.currentCommit)
    || typeof state.startedAt !== 'string' || Number.isNaN(Date.parse(state.startedAt))
    || typeof state.updatedAt !== 'string' || Number.isNaN(Date.parse(state.updatedAt))
    || !Array.isArray(state.checks)) {
    throw invalidState()
  }
  return state as UpdateSnapshot
}

function nextTimestamp(now: () => string, previous?: string): string {
  const candidate = now()
  if (Number.isNaN(Date.parse(candidate))) throw new Error('continuous adaptation clock returned an invalid timestamp')
  if (previous === undefined || candidate > previous) return candidate
  return new Date(Date.parse(previous) + 1).toISOString()
}

/** File-backed state store shared by the Host API and detached worker. */
export class UpdateStateStore {
  private readonly path: string

  /**
   * @param controlRoot - plugin-owned directory outside the user's DSH Home.
   * @param now - timestamp source used for deterministic tests.
   */
  constructor(
    private readonly controlRoot: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.path = join(controlRoot, STATE_FILE)
  }

  /**
   * Read and validate the latest atomically persisted operation state.
   * @returns the last durable state, or undefined before the first run.
   */
  async read(): Promise<UpdateSnapshot | undefined> {
    const raw = await readFile(this.path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (raw === undefined) return undefined
    try {
      return parseState(JSON.parse(raw) as unknown)
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid continuous adaptation state') throw error
      throw invalidState()
    }
  }

  /**
   * Reserve the single operation slot and publish the discovering phase.
   * @param input - immutable job identity and starting source commit.
   * @returns the durable starting state.
   */
  async begin(input: { jobId: string; currentCommit: string; workerPid: number }): Promise<UpdateSnapshot> {
    const previous = await this.read()
    if (previous !== undefined && isActiveUpdatePhase(previous.phase)) {
      throw new Error('a continuous adaptation is already running')
    }
    if (input.jobId === '' || !COMMIT.test(input.currentCommit) || input.workerPid <= 0) {
      throw new Error('invalid continuous adaptation job')
    }
    const timestamp = nextTimestamp(this.now, previous?.updatedAt)
    return this.write({
      schemaVersion: 1,
      phase: 'discovering',
      jobId: input.jobId,
      workerPid: input.workerPid,
      currentCommit: input.currentCommit,
      startedAt: timestamp,
      updatedAt: timestamp,
      checks: [],
    })
  }

  /**
   * Publish one worker-owned phase transition.
   * @param jobId - operation that owns the current state.
   * @param phase - next durable phase.
   * @param patch - fields committed with the phase.
   * @returns the new durable state.
   */
  async transition(
    jobId: string,
    phase: UpdatePhase,
    patch: Partial<Omit<UpdateSnapshot, 'schemaVersion' | 'phase' | 'jobId' | 'startedAt' | 'updatedAt'>> = {},
  ): Promise<UpdateSnapshot> {
    const current = await this.read()
    if (current === undefined || current.jobId !== jobId) {
      throw new Error('continuous adaptation job does not own the current state')
    }
    return this.write({
      ...current,
      ...patch,
      schemaVersion: 1,
      phase,
      jobId,
      updatedAt: nextTimestamp(this.now, current.updatedAt),
    })
  }

  private async write(state: UpdateSnapshot): Promise<UpdateSnapshot> {
    await mkdir(this.controlRoot, { recursive: true, mode: 0o700 })
    const temporary = join(this.controlRoot, `.state-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      await rename(temporary, this.path)
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
    return state
  }
}

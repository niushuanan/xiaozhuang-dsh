/** Host-side single-operation coordinator and detached-worker job writer. */

import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { AdaptiveUpdateApiError, type AdaptiveUpdateService } from './api.ts'
import type { StableCommand } from './agent-runner.ts'
import { UpdateStateStore } from './state.ts'
import { isActiveUpdatePhase, type IdleUpdateView, type UpdateSnapshot } from './types.ts'

/** Runtime command replayed after source cutover. */
export interface UpdateRuntime {
  command: string
  args: readonly string[]
  cwd: string
  baseUrl: string
  currentPid: number
  stableCommand: StableCommand
}

/** Immutable job file consumed by the detached worker. */
export interface UpdateJob {
  schemaVersion: 1
  jobId: string
  repositoryRoot: string
  controlRoot: string
  dshHome: string
  upstreamUrl: string
  upstreamBranch: string
  runtime: UpdateRuntime
}

/** Engine configuration fixed by the running native plugin. */
export interface AdaptiveUpdateEngineOptions {
  controlRoot: string
  repositoryRoot: string
  dshHome: string
  upstreamUrl: string
  upstreamBranch: string
  runtime: UpdateRuntime
  isIdle: () => boolean
}

/** Injectable checkout and process edges. */
export interface EngineDependencies {
  inspectCheckout: (repositoryRoot: string) => Promise<{ commit: string; clean: boolean }>
  spawnWorker: (jobPath: string) => Promise<number>
  stopWorker: (pid: number) => void
  isProcessAlive: (pid: number) => boolean
  newJobId: () => string
}

async function writeJob(path: string, job: UpdateJob): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = join(directory, `.job-${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(job, null, 2)}\n`, 'utf8')
  } finally {
    await handle.close()
  }
  try {
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

/** Native Host service coordinating API state and one detached worker. */
export class AdaptiveUpdateEngine implements AdaptiveUpdateService {
  constructor(
    private readonly options: AdaptiveUpdateEngineOptions,
    private readonly store: UpdateStateStore,
    private readonly dependencies: EngineDependencies,
  ) {}

  /** @returns persisted operation state or a checkout-derived idle view. */
  async state(): Promise<IdleUpdateView | UpdateSnapshot> {
    const current = await this.store.read()
    if (current !== undefined) return current
    const checkout = await this.dependencies.inspectCheckout(this.options.repositoryRoot)
    return { phase: 'idle', currentCommit: checkout.commit }
  }

  /** @returns whether every root Agent is currently idle. */
  idle(): boolean {
    return this.options.isIdle()
  }

  /**
   * Recover a dead applying worker, or close a dead pre-cutover operation.
   * @returns the refreshed durable state when one existed.
   */
  async recover(): Promise<UpdateSnapshot | undefined> {
    const current = await this.store.read()
    if (current === undefined || !isActiveUpdatePhase(current.phase)) return current
    if (this.dependencies.isProcessAlive(current.workerPid)) return current
    if (current.phase !== 'applying') {
      return this.store.transition(current.jobId, 'failed', {
        error: '上一次更新进程已退出，当前版本未被替换',
      })
    }
    const jobPath = join(this.options.controlRoot, 'jobs', `${current.jobId}.json`)
    const workerPid = await this.dependencies.spawnWorker(jobPath)
    return this.store.transition(current.jobId, 'applying', { workerPid })
  }

  /** Reserve and start one detached review-first operation. */
  async start(): Promise<UpdateSnapshot> {
    const previous = await this.recover()
    if (previous !== undefined && isActiveUpdatePhase(previous.phase)) {
      throw new AdaptiveUpdateApiError(
        409,
        previous.phase === 'applying' ? '自适应更新正在恢复切换' : '自适应更新正在进行中',
      )
    }
    const checkout = await this.dependencies.inspectCheckout(this.options.repositoryRoot)
    if (!checkout.clean) throw new AdaptiveUpdateApiError(409, '源码目录有未提交改动，无法安全更新')
    const jobId = this.dependencies.newJobId()
    const jobPath = join(this.options.controlRoot, 'jobs', `${jobId}.json`)
    await writeJob(jobPath, {
      schemaVersion: 1,
      jobId,
      repositoryRoot: this.options.repositoryRoot,
      controlRoot: this.options.controlRoot,
      dshHome: this.options.dshHome,
      upstreamUrl: this.options.upstreamUrl,
      upstreamBranch: this.options.upstreamBranch,
      runtime: this.options.runtime,
    })
    const workerPid = await this.dependencies.spawnWorker(jobPath)
    try {
      return await this.store.begin({ jobId, currentCommit: checkout.commit, workerPid })
    } catch (error) {
      this.dependencies.stopWorker(workerPid)
      throw error
    }
  }
}

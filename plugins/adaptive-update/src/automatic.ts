/** Persistent six-hour official-repository monitor for continuous adaptation. */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdaptiveUpdateService } from './api.ts'
import { requireCommand, runCommand } from './process.ts'
import { isActiveUpdatePhase, type AutomaticUpdateView } from './types.ts'

const SETTINGS_FILE = 'automatic.json'
const COMMIT = /^[a-f0-9]{40}$/u
const HOUR_MS = 60 * 60 * 1_000

interface AutomaticUpdateSettings {
  schemaVersion: 1
  enabled: boolean
  lastCheckedAt?: string
  lastSeenCommit?: string
  lastError?: string
}

/** HTTP operations exposed by the automatic-update controller. */
export interface AutomaticUpdateService {
  automaticState(): Promise<AutomaticUpdateView>
  setAutomatic(enabled: boolean): Promise<AutomaticUpdateView>
}

/** One official-ref observation used to decide whether adaptation is needed. */
export interface OfficialUpdateObservation {
  commit: string
  integrated: boolean
}

function parseSettings(value: unknown): AutomaticUpdateSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('持续适配自动更新设置无效')
  }
  const settings = value as Partial<AutomaticUpdateSettings>
  if (settings.schemaVersion !== 1 || typeof settings.enabled !== 'boolean'
    || (settings.lastCheckedAt !== undefined && Number.isNaN(Date.parse(settings.lastCheckedAt)))
    || (settings.lastSeenCommit !== undefined && !COMMIT.test(settings.lastSeenCommit))
    || (settings.lastError !== undefined && typeof settings.lastError !== 'string')) {
    throw new Error('持续适配自动更新设置无效')
  }
  return settings as AutomaticUpdateSettings
}

function withoutLastError(settings: AutomaticUpdateSettings): AutomaticUpdateSettings {
  const copy = { ...settings }
  delete copy.lastError
  return copy
}

class AutomaticUpdateStore {
  private readonly path: string

  constructor(private readonly controlRoot: string) {
    this.path = join(controlRoot, SETTINGS_FILE)
  }

  async read(): Promise<AutomaticUpdateSettings> {
    const raw = await readFile(this.path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (raw === undefined) return { schemaVersion: 1, enabled: false }
    try {
      return parseSettings(JSON.parse(raw) as unknown)
    } catch (error) {
      if (error instanceof Error && error.message === '持续适配自动更新设置无效') throw error
      throw new Error('持续适配自动更新设置无效')
    }
  }

  async write(settings: AutomaticUpdateSettings): Promise<AutomaticUpdateSettings> {
    await mkdir(this.controlRoot, { recursive: true, mode: 0o700 })
    const temporary = join(this.controlRoot, `.automatic-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
        encoding: 'utf8', flag: 'wx', mode: 0o600,
      })
      await rename(temporary, this.path)
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
    return settings
  }
}

/**
 * Read the official branch tip without changing the live checkout.
 * @param repositoryRoot - current Xiaozhuang DSH checkout.
 * @param upstreamUrl - official Git repository.
 * @param upstreamBranch - official branch to observe.
 * @returns exact official commit and whether the local HEAD already contains it.
 */
export async function inspectOfficialUpdate(
  repositoryRoot: string,
  upstreamUrl: string,
  upstreamBranch: string,
): Promise<OfficialUpdateObservation> {
  const remote = await runCommand('git', [
    'ls-remote', '--heads', upstreamUrl, `refs/heads/${upstreamBranch}`,
  ], { cwd: repositoryRoot, timeoutMs: 30_000 })
  requireCommand('git ls-remote official DSH', remote)
  const commit = remote.stdout.trim().split(/\s+/u)[0] ?? ''
  if (!COMMIT.test(commit)) throw new Error('官方 DSH 分支没有返回有效提交')

  const known = await runCommand('git', ['cat-file', '-e', `${commit}^{commit}`], {
    cwd: repositoryRoot,
    timeoutMs: 30_000,
  })
  if (known.exitCode !== 0) return { commit, integrated: false }
  const ancestor = await runCommand('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
    cwd: repositoryRoot,
    timeoutMs: 30_000,
  })
  if (ancestor.exitCode !== 0 && ancestor.exitCode !== 1) {
    requireCommand('git merge-base official DSH', ancestor)
  }
  return { commit, integrated: ancestor.exitCode === 0 }
}

/** Persistent monitor that checks immediately when enabled and then every configured interval. */
export class AutomaticUpdateMonitor implements AutomaticUpdateService {
  private readonly store: AutomaticUpdateStore
  private settings: AutomaticUpdateSettings = { schemaVersion: 1, enabled: false }
  private ready: Promise<void> = Promise.resolve()
  private timer: NodeJS.Timeout | undefined
  private checking = false

  constructor(
    controlRoot: string,
    private readonly intervalMs: number,
    private readonly updater: AdaptiveUpdateService,
    private readonly inspectOfficial: () => Promise<OfficialUpdateObservation>,
  ) {
    this.store = new AutomaticUpdateStore(controlRoot)
  }

  /**
   * Load the durable preference and arm the interval.
   * @returns a disposer that stops the automatic monitor.
   */
  start(): () => void {
    this.ready = this.store.read().then((settings) => {
      this.settings = settings
      this.arm()
      if (settings.enabled) void this.checkNow()
    }).catch((error) => {
      this.settings = {
        schemaVersion: 1,
        enabled: false,
        lastError: error instanceof Error ? error.message : String(error),
      }
    })
    return () => { this.dispose() }
  }

  /** Stop the in-process timer without changing the user's durable preference. */
  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  /** @returns the current automatic-update preference and latest observation. */
  async automaticState(): Promise<AutomaticUpdateView> {
    await this.ready
    return this.view()
  }

  /** Persist a user toggle; enabling arms the timer and starts one check immediately. */
  async setAutomatic(enabled: boolean): Promise<AutomaticUpdateView> {
    await this.ready
    this.settings = await this.store.write({ ...withoutLastError(this.settings), enabled })
    this.arm()
    if (enabled) void this.checkNow()
    return this.view()
  }

  private view(): AutomaticUpdateView {
    return {
      enabled: this.settings.enabled,
      checking: this.checking,
      intervalHours: this.intervalMs / HOUR_MS,
      ...(this.settings.lastCheckedAt === undefined ? {} : { lastCheckedAt: this.settings.lastCheckedAt }),
      ...(this.settings.lastSeenCommit === undefined ? {} : { lastSeenCommit: this.settings.lastSeenCommit }),
      ...(this.settings.lastError === undefined ? {} : { lastError: this.settings.lastError }),
    }
  }

  private arm(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
    if (!this.settings.enabled) return
    this.timer = setInterval(() => { void this.checkNow() }, this.intervalMs)
    this.timer.unref()
  }

  private async checkNow(): Promise<void> {
    await this.ready
    if (!this.settings.enabled || this.checking) return
    this.checking = true
    try {
      const official = await this.inspectOfficial()
      if (!this.settings.enabled) return
      this.settings = await this.store.write({
        ...withoutLastError(this.settings),
        lastCheckedAt: new Date().toISOString(),
        lastSeenCommit: official.commit,
      })
      const operation = await this.updater.state()
      if (official.integrated) return
      if (operation.phase !== 'idle') {
        if (isActiveUpdatePhase(operation.phase) || (
          operation.phase === 'completed' && operation.upstreamCommit === official.commit
        )) return
      }
      if (!this.settings.enabled) return
      await this.updater.start()
    } catch (error) {
      if (!this.settings.enabled) return
      this.settings = await this.store.write({
        ...this.settings,
        lastError: error instanceof Error ? error.message : String(error),
      }).catch(() => this.settings)
    } finally {
      this.checking = false
    }
  }
}

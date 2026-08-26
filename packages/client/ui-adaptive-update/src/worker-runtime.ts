/** Concrete detached-worker operations for one conflict-focused continuous adaptation. */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pinStableCommand, runStableAgent } from './agent-runner.ts'
import { applyCandidate, recoverInterruptedCutover, type CutoverDependencies } from './cutover.ts'
import type { UpdateJob } from './engine.ts'
import { requireCommand, runCommand, sanitizedProcessEnv } from './process.ts'
import {
  assertCandidateResolved, createCandidateWorktree, createRepositoryReview,
  removeCandidateWorktree, removeReviewWorktree,
} from './repository.ts'
import { pruneOwnedArtifacts } from './retention.ts'
import { createShadowHome } from './shadow-home.ts'
import { createDataSnapshot, restoreDataSnapshot } from './snapshot.ts'
import { UpdateStateStore } from './state.ts'
import type { CompatibilityReport, UpdateCheckResult, UpdateSnapshot } from './types.ts'
import { validateCandidateWithRepairs } from './validation.ts'
import { prepareUpdateCandidate } from './worker.ts'

const COMMIT = /^[a-f0-9]{40}$/u
const JOB_ID = /^[a-z0-9][a-z0-9-]{0,79}$/u
const ADAPTATION_COMPLETE = '[DSH_ADAPTATION_COMPLETE]'

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * Accept only an Agent result that explicitly declares its atomic task complete.
 * @param output - stable Agent final stdout.
 * @returns final report text without the transport marker.
 */
export function completedAgentOutput(output: string): string {
  const marker = ADAPTATION_COMPLETE
  const final = output.trim()
  if (!final.endsWith(marker)) {
    throw new Error('stable DSH Agent returned an incomplete adaptation result')
  }
  return final.slice(0, -marker.length).trim()
}

/**
 * Run one bounded conflict-resolution turn and require an atomic completion marker.
 * @param originalTask - complete task repeated for every continuation turn.
 * @param runTurn - one bounded stable Agent invocation.
 * @returns the completed report without its transport marker.
 */
export async function completeAgentTurns(
  originalTask: string,
  runTurn: (task: string) => Promise<string>,
): Promise<string> {
  return completedAgentOutput(await runTurn(originalTask))
}

/**
 * Parse the secret-free immutable job written by the live Host plugin.
 * @param value - untrusted JSON value read from the job file.
 * @returns a validated detached-worker job.
 */
export function parseUpdateJob(value: unknown): UpdateJob {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid continuous adaptation job')
  }
  const job = value as Partial<UpdateJob>
  const runtime = job.runtime
  const stable = runtime?.stableCommand
  if (job.schemaVersion !== 1 || typeof job.jobId !== 'string' || !JOB_ID.test(job.jobId)
    || typeof job.repositoryRoot !== 'string' || !isAbsolute(job.repositoryRoot)
    || typeof job.controlRoot !== 'string' || !isAbsolute(job.controlRoot)
    || typeof job.dshHome !== 'string' || !isAbsolute(job.dshHome)
    || typeof job.upstreamUrl !== 'string' || job.upstreamUrl === ''
    || typeof job.upstreamBranch !== 'string' || job.upstreamBranch === ''
    || runtime === undefined || typeof runtime.command !== 'string' || runtime.command === ''
    || !isStringArray(runtime.args) || typeof runtime.cwd !== 'string' || runtime.cwd === ''
    || typeof runtime.baseUrl !== 'string' || !runtime.baseUrl.startsWith('http://127.0.0.1:')
    || !Number.isInteger(runtime.currentPid) || runtime.currentPid <= 0
    || stable === undefined || typeof stable.command !== 'string' || stable.command === ''
    || !isStringArray(stable.argsPrefix)) {
    throw new Error('invalid continuous adaptation job')
  }
  return job as UpdateJob
}

/**
 * Replay absolute source paths under another worktree.
 * @param args - original process argument vector.
 * @param repositoryRoot - source checkout used by the running product.
 * @param targetRoot - review or candidate checkout used by the replayed process.
 * @returns the replay-safe argument vector for the target checkout.
 */
export function repositoryRuntimeArgs(
  args: readonly string[], repositoryRoot: string, targetRoot: string,
): string[] {
  return args.map((argument) => {
    if (!isAbsolute(argument)) return argument
    const local = relative(repositoryRoot, argument)
    if (local === '..' || local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) return argument
    return resolve(targetRoot, local)
  })
}

async function git(cwd: string, args: readonly string[], timeoutMs = 300_000): Promise<string> {
  const result = await runCommand('git', args, { cwd, timeoutMs })
  requireCommand(`git ${args[0] ?? ''}`, result)
  return result.stdout.trim()
}

async function waitForState(store: UpdateStateStore, jobId: string): Promise<UpdateSnapshot> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const state = await store.read()
    if (state?.jobId === jobId) return state
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error('continuous adaptation worker could not acquire its durable state')
}

function adaptationPrompt(report: CompatibilityReport): string {
  return [
    '你正在“持续适配”的独立候选工作树中，本地产品已与锁定的官方提交执行 --no-commit 合并。',
    '只处理下面列出的真实合并冲突及其直接编译依赖，不做全仓深度审查、不重构、不扩大范围。',
    '优先保留官方最新原生能力，同时保留冲突处涉及的本地产品行为和用户数据合同。',
    '“持续适配”必须保留独立候选区、空闲切换、数据快照和失败回滚。',
    '不要运行测试、回放、构建或依赖安装；外部工人只会执行一次依赖准备和一次生产构建。',
    '不要 git commit，不要修改真实 DSH_HOME，不要启动或停止当前产品，不要启动子代理或后台任务。',
    `窄范围合并清单：${JSON.stringify({
      conflictFiles: report.conflictFiles,
      directlyImpactedPlugins: report.impactedPlugins,
    })}`,
    `解决全部冲突后简要说明改动，最后一行必须且只能是 ${ADAPTATION_COMPLETE}。`,
  ].join('\n\n')
}

function validationRepairPrompt(report: CompatibilityReport, failure: string, attempt: number): string {
  return [
    `你正在“持续适配”候选区进行第 ${attempt} 次可构建性修复。`,
    '只根据下面的生产构建错误修改直接相关文件，不做全仓审查、不重构、不刷新快照。',
    '不要运行测试、回放、构建或依赖安装；不要 git commit、修改真实 DSH_HOME、启动或停止当前产品。',
    '不要启动子代理、并行开发或后台任务。',
    `构建失败证据：\n${failure}`,
    `原始冲突文件：${JSON.stringify(report.conflictFiles)}`,
    `完成直接修复后简要说明改动；最后一行必须且只能是 ${ADAPTATION_COMPLETE}。`,
  ].join('\n\n')
}

async function probeWeb(baseUrl: string): Promise<{ hostReady: boolean; clientReady: boolean; detail: string }> {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3_000) })
    if (!response.ok) return { hostReady: false, clientReady: false, detail: `HTTP ${response.status}` }
    const html = await response.text()
    const source = /<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["']/iu.exec(html)?.[1]
    if (source === undefined) return { hostReady: true, clientReady: false, detail: '首页未包含 Client 脚本' }
    const asset = await fetch(new URL(source, baseUrl), { signal: AbortSignal.timeout(3_000) })
    return {
      hostReady: true,
      clientReady: asset.ok,
      detail: asset.ok ? 'Host 与 Client 均已就绪' : `Client 资源 HTTP ${asset.status}`,
    }
  } catch (error) {
    return { hostReady: false, clientReady: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

async function waitForWeb(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await probeWeb(baseUrl)
    if (result.hostReady && result.clientReady) return true
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500))
  }
  return false
}

function startRuntime(
  job: UpdateJob,
  cwd: string,
  dshHome: string,
): number {
  const args = repositoryRuntimeArgs(job.runtime.args, job.repositoryRoot, cwd)
  const child = spawn(job.runtime.command, args, {
    cwd,
    env: { ...sanitizedProcessEnv(), DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: '1' },
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  if (child.pid === undefined) throw new Error('continuous adaptation could not start DSH runtime')
  return child.pid
}

async function stopPid(pid: number): Promise<void> {
  try { process.kill(pid, 'SIGTERM') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    throw error
  }
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try { process.kill(pid, 0) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
      throw error
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200))
  }
  process.kill(pid, 'SIGKILL')
}

async function listenerPids(baseUrl: string, cwd: string): Promise<number[]> {
  const port = new URL(baseUrl).port
  const result = await runCommand('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { cwd, timeoutMs: 10_000 })
  if (result.exitCode === 1 && result.stdout.trim() === '') return []
  requireCommand('lsof listener', result)
  return result.stdout.split('\n').map(Number).filter(pid => Number.isInteger(pid) && pid > 0)
}

async function idleAt(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/plugins/ui-adaptive-update/api/idle`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) return false
    return (await response.json() as { idle?: unknown }).idle === true
  } catch { return false }
}

async function commitCandidate(candidatePath: string, upstreamCommit: string): Promise<string> {
  await git(candidatePath, ['add', '-A'])
  await git(candidatePath, [
    '-c', 'user.name=Xiaozhuang Continuous Adaptation',
    '-c', 'user.email=adaptive-update@localhost',
    '-c', 'core.hooksPath=/dev/null',
    'commit', '--no-verify', '-m', `chore(update): adapt to official ${upstreamCommit.slice(0, 12)}`,
  ])
  const commit = await git(candidatePath, ['rev-parse', 'HEAD'])
  if (!COMMIT.test(commit)) throw new Error('continuous adaptation produced an invalid candidate commit')
  return commit
}

async function runCheck(check: UpdateCheckResult, candidatePath: string): Promise<UpdateCheckResult> {
  const commands: Record<string, { command: string; args: string[]; timeoutMs: number }> = {
    install: {
      command: 'pnpm', args: ['install', '--frozen-lockfile', '--prefer-offline'], timeoutMs: 600_000,
    },
    build: { command: 'pnpm', args: ['run', 'build'], timeoutMs: 1_200_000 },
  }
  const command = commands[check.id]
  if (command === undefined) return { ...check, status: 'failed', detail: '未知验证项' }
  const result = await runCommand(command.command, command.args, {
    cwd: candidatePath,
    timeoutMs: command.timeoutMs,
  })
  const detail = (result.stderr.trim() || result.stdout.trim()).slice(-4_000)
  const passed = !result.timedOut && result.signal === null && result.exitCode === 0
  return { ...check, status: passed ? 'passed' : 'failed', detail: detail || (passed ? '通过' : '命令失败') }
}

function cutoverDependencies(job: UpdateJob): CutoverDependencies {
  return {
    isCheckoutClean: async repositoryRoot => (await git(repositoryRoot, ['status', '--porcelain'])) === '',
    waitForIdle: async () => {
      const deadline = Date.now() + 30 * 60_000
      while (Date.now() < deadline) {
        if (await idleAt(job.runtime.baseUrl)) return
        await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
      }
      throw new Error('等待当前对话空闲超时')
    },
    stopCurrent: stopPid,
    createSnapshot: createDataSnapshot,
    advanceCheckout: async (repositoryRoot, commit) => { await git(repositoryRoot, ['reset', '--hard', commit]) },
    waitForReadiness: async () => waitForWeb(job.runtime.baseUrl, 15_000),
    spawnRuntime: async () => startRuntime(job, job.repositoryRoot, job.dshHome),
    stopCandidate: async (pid) => {
      if (pid !== undefined) await stopPid(pid).catch(() => undefined)
      for (const listener of await listenerPids(job.runtime.baseUrl, job.repositoryRoot)) {
        if (listener !== process.pid) await stopPid(listener).catch(() => undefined)
      }
    },
    restoreSnapshot: restoreDataSnapshot,
  }
}

/**
 * Execute one immutable detached-worker job to a ready candidate or rollback.
 * @param job - validated immutable update request created by the live Host.
 */
export async function runUpdateJob(job: UpdateJob): Promise<void> {
  const store = new UpdateStateStore(job.controlRoot)
  const initial = await waitForState(store, job.jobId)
  const shadowHome = await createShadowHome(job.dshHome, job.controlRoot, job.jobId)
  let candidatePath: string | undefined
  try {
    if (initial.phase === 'applying') {
      if (initial.previousCommit === undefined || initial.candidateCommit === undefined) {
        throw new Error('continuous adaptation applying state lacks pinned commits')
      }
      const dependencies = {
        ...cutoverDependencies(job),
        currentHead: async (repositoryRoot: string) => git(repositoryRoot, ['rev-parse', 'HEAD']),
      }
      const recovered = await recoverInterruptedCutover({
        repositoryRoot: job.repositoryRoot,
        dshHome: job.dshHome,
        controlRoot: job.controlRoot,
        jobId: job.jobId,
        currentCommit: initial.previousCommit,
        candidateCommit: initial.candidateCommit,
        currentPid: job.runtime.currentPid,
        ...(initial.snapshotPath === undefined ? {} : { snapshotPath: initial.snapshotPath }),
      }, dependencies)
      await store.transition(job.jobId, recovered.status, { snapshotPath: recovered.snapshotPath })
      return
    }

    const stableCommand = pinStableCommand(job.runtime.stableCommand, job.repositoryRoot)
    const prepared = await prepareUpdateCandidate({
      repositoryRoot: job.repositoryRoot,
      controlRoot: job.controlRoot,
      realHome: job.dshHome,
      shadowHome,
      jobId: job.jobId,
      upstreamUrl: job.upstreamUrl,
      upstreamBranch: job.upstreamBranch,
      stableCommand,
    }, {
      createReview: createRepositoryReview,
      removeReview: removeReviewWorktree,
      createCandidate: createCandidateWorktree,
      runAgent: async ({ cwd, shadowHome: home, stableCommand, report }) => {
        const originalTask = adaptationPrompt(report)
        return completeAgentTurns(originalTask, task => runStableAgent({
          ...stableCommand,
          cwd,
          stableRoot: job.repositoryRoot,
          shadowHome: home,
          task,
          timeoutMs: 20 * 60_000,
        }))
      },
      assertCandidateResolved,
      publish: async (phase, patch = {}) => { await store.transition(job.jobId, phase, patch) },
    })
    candidatePath = prepared.candidatePath
    const preparedCandidatePath = prepared.candidatePath
    await store.transition(job.jobId, 'validating', { report: prepared.report, checks: [] })
    const validationDependencies = {
      unresolvedFiles: async (path: string) => {
        const files = await git(path, ['diff', '--name-only', '--diff-filter=U'])
        return files === '' ? [] : files.split('\n').filter(Boolean)
      },
      runCheck,
      publishChecks: async (checksPatch: readonly UpdateCheckResult[]) => {
        await store.transition(job.jobId, 'validating', { checks: checksPatch })
      },
    }
    const checks = await validateCandidateWithRepairs(
      preparedCandidatePath,
      validationDependencies,
      async (failure, attempt) => {
        await store.transition(job.jobId, 'adapting')
        const originalTask = validationRepairPrompt(prepared.report, failure, attempt)
        await completeAgentTurns(originalTask, task => runStableAgent({
          ...stableCommand,
          cwd: preparedCandidatePath,
          stableRoot: job.repositoryRoot,
          shadowHome,
          task,
          timeoutMs: 20 * 60_000,
        }))
        await assertCandidateResolved(preparedCandidatePath, prepared.currentCommit)
        await store.transition(job.jobId, 'validating', { checks: [] })
      },
      1,
    )
    const candidateCommit = await commitCandidate(preparedCandidatePath, prepared.upstreamCommit)
    await store.transition(job.jobId, 'waiting-for-idle', {
      upstreamCommit: prepared.upstreamCommit,
      previousCommit: prepared.currentCommit,
      candidateCommit,
      checks,
    })
    const baseDependencies = cutoverDependencies(job)
    const dependencies: CutoverDependencies = {
      ...baseDependencies,
      createSnapshot: async (dshHome, controlRoot, jobId) => {
        const snapshotPath = await baseDependencies.createSnapshot(dshHome, controlRoot, jobId)
        await store.transition(job.jobId, 'applying', { snapshotPath })
        return snapshotPath
      },
    }
    await store.transition(job.jobId, 'applying')
    const result = await applyCandidate({
      repositoryRoot: job.repositoryRoot,
      dshHome: job.dshHome,
      controlRoot: job.controlRoot,
      jobId: job.jobId,
      currentCommit: prepared.currentCommit,
      candidateCommit,
      currentPid: job.runtime.currentPid,
    }, dependencies)
    await store.transition(job.jobId, result.status, { snapshotPath: result.snapshotPath })
    if (result.status === 'completed') {
      await removeCandidateWorktree(job.repositoryRoot, candidatePath, job.jobId)
      candidatePath = undefined
      await pruneOwnedArtifacts(job.controlRoot, { keepSnapshot: result.snapshotPath })
    }
  } catch (error) {
    const state = await store.read().catch(() => undefined)
    if (state?.jobId === job.jobId && state.phase !== 'applying') {
      await store.transition(job.jobId, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined)
    }
    throw error
  } finally {
    if (candidatePath !== undefined) {
      const state = await store.read().catch(() => undefined)
      if (state?.phase !== 'applying') {
        await removeCandidateWorktree(job.repositoryRoot, candidatePath, job.jobId).catch(() => undefined)
      }
    }
    await writeFile(join(job.controlRoot, 'logs', `${job.jobId}.done`), `${new Date().toISOString()}\n`, {
      flag: 'w', mode: 0o600,
    }).catch(() => undefined)
  }
}

/**
 * Read and execute a job file supplied as the worker's only argument.
 * @param jobPath - absolute private JSON job path.
 */
export async function runUpdateJobFile(jobPath: string): Promise<void> {
  const job = parseUpdateJob(JSON.parse(await readFile(jobPath, 'utf8')) as unknown)
  await runUpdateJob(job)
}

/**
 * Create a stable unique job id used by the live Host engine.
 * @returns a filesystem- and Git-ref-safe operation identifier.
 */
export function newUpdateJobId(): string {
  return `${new Date().toISOString().replace(/[^0-9]/gu, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`
}

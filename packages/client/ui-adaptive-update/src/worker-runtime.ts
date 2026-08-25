/** Concrete detached-worker operations for one review-first adaptive update. */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { runStableAgent } from './agent-runner.ts'
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
import { validateCandidate } from './validation.ts'
import { prepareUpdateCandidate } from './worker.ts'

const COMMIT = /^[a-f0-9]{40}$/u
const JOB_ID = /^[a-z0-9][a-z0-9-]{0,79}$/u

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/**
 * Parse the secret-free immutable job written by the live Host plugin.
 * @param value - untrusted JSON value read from the job file.
 * @returns a validated detached-worker job.
 */
export function parseUpdateJob(value: unknown): UpdateJob {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid adaptive update job')
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
    throw new Error('invalid adaptive update job')
  }
  return job as UpdateJob
}

/**
 * Replay absolute source paths under another worktree and optionally replace Web launch flags.
 * @param args - original process argument vector.
 * @param repositoryRoot - source checkout used by the running product.
 * @param targetRoot - review or candidate checkout used by the replayed process.
 * @param webPort - isolated shadow port that replaces any original Web port.
 * @returns the replay-safe argument vector for the target checkout.
 */
export function repositoryRuntimeArgs(
  args: readonly string[], repositoryRoot: string, targetRoot: string, webPort?: number,
): string[] {
  const replayed = args.flatMap((argument, index) => {
    if (webPort !== undefined) {
      if (argument === '--no-open' || argument.startsWith('--port=')) return []
      if (index > 0 && args[index - 1] === '--port') return []
      if (argument === '--port') return []
    }
    if (!isAbsolute(argument)) return argument
    const local = relative(repositoryRoot, argument)
    if (local === '..' || local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) return argument
    return resolve(targetRoot, local)
  })
  if (webPort !== undefined) replayed.push('--port', String(webPort), '--no-open')
  return replayed
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
  throw new Error('adaptive update worker could not acquire its durable state')
}

function reviewPrompt(report: CompatibilityReport): string {
  return [
    '你正在一个可随时丢弃的 DSH 合并审查工作树中。只做深度审查，不修改、不提交。',
    '从真实用户任务出发，逐项评估官方更新应用后的原生插件冲突、数据/对话兼容、Host/Client 合同、设置入口和启动风险。',
    '对每个冲突给出根因、用户影响、具体处理方法和验收证据；明确不能破坏“自适应更新”自身的审查、影子启动、空闲切换和回滚链路。',
    `确定性扫描摘要：${JSON.stringify(report)}`,
    '最后输出一份结构化中文审查报告，不要开始改代码。',
  ].join('\n\n')
}

function adaptationPrompt(report: CompatibilityReport): string {
  return [
    '你正在 DSH 自适应更新的独立候选工作树中。这个工作树已将本地产品与锁定的官方提交执行 --no-commit 合并。',
    '请深度理解双方意图，解决所有冲突并完成必要的兼容改造。优先保留官方最新原生能力，同时保留本地产品功能和用户数据合同。',
    '“自适应更新”插件必须继续是原生 Host+Client 插件，且必须保留长审查不停机、独立候选区、影子启动、空闲切换、数据快照和失败回滚。',
    '可以修改候选区文件和运行定向验证，但不要 git commit，不要修改真实 DSH_HOME，不要启动或停止当前产品。',
    `已完成的审查报告：\n${report.review}\n\n确定性扫描：${JSON.stringify({
      conflictFiles: report.conflictFiles,
      overlappingFiles: report.overlappingFiles,
      impactedPlugins: report.impactedPlugins,
      riskAreas: report.riskAreas,
    })}`,
    '完成后说明改了什么和建议的验证点，把确定性命令交给外部更新工人执行。',
  ].join('\n\n')
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('adaptive update could not reserve a shadow port'))
        return
      }
      server.close(error => error === undefined ? resolvePort(address.port) : reject(error))
    })
  })
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
  webPort?: number,
): number {
  const args = repositoryRuntimeArgs(job.runtime.args, job.repositoryRoot, cwd, webPort)
  const child = spawn(job.runtime.command, args, {
    cwd,
    env: { ...sanitizedProcessEnv(), DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: '1' },
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  if (child.pid === undefined) throw new Error('adaptive update could not start DSH runtime')
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
    '-c', 'user.name=Xiaozhuang Adaptive Update',
    '-c', 'user.email=adaptive-update@localhost',
    '-c', 'core.hooksPath=/dev/null',
    'commit', '--no-verify', '-m', `chore(update): adapt to official ${upstreamCommit.slice(0, 12)}`,
  ])
  const commit = await git(candidatePath, ['rev-parse', 'HEAD'])
  if (!COMMIT.test(commit)) throw new Error('adaptive update produced an invalid candidate commit')
  return commit
}

async function runCheck(check: UpdateCheckResult, candidatePath: string): Promise<UpdateCheckResult> {
  const commands: Record<string, { command: string; args: string[]; timeoutMs: number; env?: NodeJS.ProcessEnv }> = {
    install: { command: 'pnpm', args: ['install', '--frozen-lockfile'], timeoutMs: 600_000 },
    'plugin-tests': {
      command: 'pnpm', args: ['exec', 'vitest', 'run', 'packages/client/ui-adaptive-update/tests'], timeoutMs: 600_000,
    },
    typecheck: { command: 'pnpm', args: ['run', 'typecheck'], timeoutMs: 1_200_000 },
    build: { command: 'pnpm', args: ['run', 'build'], timeoutMs: 1_200_000 },
    'web-replay': {
      command: 'pnpm', args: ['run', 'test:web:built'], timeoutMs: 1_200_000,
      env: { ...sanitizedProcessEnv(), DSH_SNAPSHOT: 'replay' },
    },
  }
  const command = commands[check.id]
  if (command === undefined) return { ...check, status: 'failed', detail: '未知验证项' }
  const result = await runCommand(command.command, command.args, {
    cwd: candidatePath,
    timeoutMs: command.timeoutMs,
    ...(command.env === undefined ? {} : { env: command.env }),
  })
  const detail = (result.stderr.trim() || result.stdout.trim()).slice(-4_000)
  const passed = !result.timedOut && result.signal === null && result.exitCode === 0
  return { ...check, status: passed ? 'passed' : 'failed', detail: detail || (passed ? '通过' : '命令失败') }
}

async function shadowBoot(job: UpdateJob, candidatePath: string, shadowHome: string) {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const pid = startRuntime(job, candidatePath, shadowHome, port)
  try {
    const deadline = Date.now() + 90_000
    let result = await probeWeb(baseUrl)
    while ((!result.hostReady || !result.clientReady) && Date.now() < deadline) {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 500))
      result = await probeWeb(baseUrl)
    }
    return result
  } finally {
    await stopPid(pid).catch(() => undefined)
  }
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
        throw new Error('adaptive update applying state lacks pinned commits')
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

    const prepared = await prepareUpdateCandidate({
      repositoryRoot: job.repositoryRoot,
      controlRoot: job.controlRoot,
      realHome: job.dshHome,
      shadowHome,
      jobId: job.jobId,
      upstreamUrl: job.upstreamUrl,
      upstreamBranch: job.upstreamBranch,
      stableCommand: job.runtime.stableCommand,
    }, {
      createReview: createRepositoryReview,
      removeReview: removeReviewWorktree,
      createCandidate: createCandidateWorktree,
      runAgent: async ({ mode, cwd, shadowHome: home, stableCommand, report }) => runStableAgent({
        ...stableCommand,
        cwd,
        shadowHome: home,
        task: mode === 'review' ? reviewPrompt(report) : adaptationPrompt(report),
        timeoutMs: mode === 'review' ? 45 * 60_000 : 90 * 60_000,
      }),
      assertCandidateResolved,
      publish: async (phase, patch = {}) => { await store.transition(job.jobId, phase, patch) },
    })
    candidatePath = prepared.candidatePath
    await store.transition(job.jobId, 'validating', { report: prepared.report, checks: [] })
    const checks = await validateCandidate(candidatePath, {
      unresolvedFiles: async (path) => {
        const files = await git(path, ['diff', '--name-only', '--diff-filter=U'])
        return files === '' ? [] : files.split('\n').filter(Boolean)
      },
      runCheck,
      bootShadow: path => shadowBoot(job, path, shadowHome),
      publishChecks: async (checksPatch) => { await store.transition(job.jobId, 'validating', { checks: checksPatch }) },
    })
    const candidateCommit = await commitCandidate(candidatePath, prepared.upstreamCommit)
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

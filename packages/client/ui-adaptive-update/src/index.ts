/** Native Host half of the review-first adaptive update plugin. */

import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ADAPTIVE_UPDATE_API_ROUTE, adaptiveUpdateApiHandler } from './api.ts'
import { AdaptiveUpdateEngine } from './engine.ts'
import { requireCommand, runCommand, sanitizedProcessEnv } from './process.ts'
import { UpdateStateStore } from './state.ts'
import { newUpdateJobId } from './worker-runtime.ts'

/** Native updater configuration; defaults follow the official DSH repository. */
export interface Config {
  /** Official Git repository inspected and fetched by the detached worker. */
  upstreamUrl: string
  /** Official branch pinned once at the beginning of an update operation. */
  upstreamBranch: string
  /** Local clean source checkout; defaults to the running process directory. */
  repositoryRoot?: string
}

/** Native updater configuration schema. */
export const Config: z<Config> = z.object({
  upstreamUrl: z.string().default('https://github.com/deepseek-ai/deepseek-harness.git'),
  upstreamBranch: z.string().default('master'),
  repositoryRoot: z.string(),
})

/** Services required by the Host API and idle barrier. */
export const inject = ['webServer', 'agents']

async function inspectCheckout(repositoryRoot: string): Promise<{ commit: string; clean: boolean }> {
  const head = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, timeoutMs: 30_000 })
  requireCommand('git rev-parse', head)
  const status = await runCommand('git', ['status', '--porcelain'], { cwd: repositoryRoot, timeoutMs: 30_000 })
  requireCommand('git status', status)
  return { commit: head.stdout.trim(), clean: status.stdout.trim() === '' }
}

function workerEntry(): { path: string; argsPrefix: string[] } {
  const sourceMode = fileURLToPath(import.meta.url).endsWith('.ts')
  return sourceMode
    ? { path: fileURLToPath(new URL('./worker-entry.ts', import.meta.url)), argsPrefix: ['--import', 'tsx/esm'] }
    : { path: fileURLToPath(new URL('./worker-entry.js', import.meta.url)), argsPrefix: [] }
}

/** Register the native API and detached-worker recovery for one web runtime. */
export function apply(ctx: Context, config: Config): void {
  const repositoryRoot = config.repositoryRoot ?? process.cwd()
  const dshHome = resolveDshHome()
  const controlRoot = `${dshHome}.adaptive-update`
  const entry = workerEntry()
  const engine = new AdaptiveUpdateEngine({
    controlRoot,
    repositoryRoot,
    dshHome,
    upstreamUrl: config.upstreamUrl,
    upstreamBranch: config.upstreamBranch,
    runtime: {
      command: process.execPath,
      args: [...process.execArgv, ...process.argv.slice(1)],
      cwd: process.cwd(),
      baseUrl: `http://127.0.0.1:${ctx.webServer.port}`,
      currentPid: process.pid,
      stableCommand: {
        command: process.execPath,
        argsPrefix: [...process.execArgv, process.argv[1] ?? ''],
      },
    },
    isIdle: () => ctx.agents.roots().every(agent => agent.status === 'idle'),
  }, new UpdateStateStore(controlRoot), {
    inspectCheckout,
    spawnWorker: async (jobPath) => {
      const logDirectory = `${controlRoot}/logs`
      mkdirSync(logDirectory, { recursive: true, mode: 0o700 })
      const log = openSync(`${logDirectory}/${jobPath.split('/').at(-1) ?? 'worker'}.log`, 'a', 0o600)
      const child = spawn(process.execPath, [...entry.argsPrefix, entry.path, jobPath], {
        cwd: repositoryRoot,
        env: sanitizedProcessEnv(),
        detached: true,
        stdio: ['ignore', log, log],
      })
      closeSync(log)
      child.unref()
      if (child.pid === undefined) throw new Error('无法启动自适应更新后台工人')
      return child.pid
    },
    stopWorker: (pid) => { try { process.kill(pid, 'SIGTERM') } catch { /* already stopped */ } },
    isProcessAlive: (pid) => {
      try { process.kill(pid, 0); return true } catch { return false }
    },
    newJobId: newUpdateJobId,
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ADAPTIVE_UPDATE_API_ROUTE,
    handler: (req, res) => { void adaptiveUpdateApiHandler(req, res, engine) },
  }), 'ui-adaptive-update: native update API')
  void engine.recover().catch(error => ctx.logger.warn(error instanceof Error ? error : new Error(String(error))))
}

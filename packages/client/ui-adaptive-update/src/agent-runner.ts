/** Stable-version headless Agent runner for review and candidate adaptation. */

import { createRequire } from 'node:module'
import { lstat, mkdir, readdir, rm, symlink } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { runCommand, sanitizedProcessEnv, type CommandResult } from './process.ts'

/** Exact stable CLI invocation independent from the candidate source tree. */
export interface StableCommand {
  command: string
  argsPrefix: readonly string[]
}

/** A stable Agent turn that exited without a successful bounded completion. */
export class StableAgentRunError extends Error {
  readonly timedOut: boolean
  readonly output: string

  constructor(result: CommandResult) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no output'
    super(`stable DSH Agent failed (exit=${String(result.exitCode)}, signal=${String(result.signal)}, timedOut=${String(result.timedOut)}): ${detail}`)
    this.name = 'StableAgentRunError'
    this.timedOut = result.timedOut
    this.output = result.stdout.trim()
  }
}

/**
 * Resolve the source-mode TypeScript loader from the stable checkout so the
 * Agent can run while its current directory is a dependency-free worktree.
 * @param command - launch vector captured from the live stable product.
 * @param repositoryRoot - stable checkout that owns the installed loader.
 * @returns launch vector independent from the review or candidate directory.
 */
export function pinStableCommand(command: StableCommand, repositoryRoot: string): StableCommand {
  const requireFromStable = createRequire(join(repositoryRoot, 'package.json'))
  return {
    ...command,
    argsPrefix: command.argsPrefix.map(argument => (
      argument === 'tsx/esm' ? requireFromStable.resolve(argument) : argument
    )),
  }
}

async function dependencyDirectories(directory: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory() && entry.name === 'node_modules') {
      found.push(path)
    } else if (entry.isDirectory()) {
      found.push(...await dependencyDirectories(path))
    }
  }
  return found
}

async function mountStableDependencies(stableRoot: string, targetRoot: string): Promise<string[]> {
  const mounted: string[] = []
  try {
    for (const source of await dependencyDirectories(stableRoot)) {
      const target = join(targetRoot, relative(stableRoot, source))
      await mkdir(dirname(target), { recursive: true })
      const exists = await lstat(target).then(() => true).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return false
        throw error
      })
      if (exists) continue
      await symlink(source, target, 'junction')
      mounted.push(target)
    }
    return mounted
  } catch (error) {
    await Promise.all(mounted.map(path => rm(path, { force: true })))
    throw error
  }
}

/**
 * Run one stable DSH headless task in an isolated working tree and Home.
 * @param options - stable CLI, candidate directory, shadow Home, and task.
 * @returns the final assistant text from stdout.
 */
export async function runStableAgent(options: StableCommand & {
  cwd: string
  stableRoot: string
  shadowHome: string
  task: string
  timeoutMs: number
}): Promise<string> {
  const mounted = await mountStableDependencies(options.stableRoot, options.cwd)
  try {
    const result = await runCommand(options.command, [
      ...options.argsPrefix,
      '--profile', 'headless', options.task,
    ], {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      env: {
        ...sanitizedProcessEnv(),
        DSH_HOME: options.shadowHome,
        DSH_TELEMETRY_DISABLED: '1',
      },
    })
    if (result.timedOut || result.signal !== null || result.exitCode !== 0) {
      throw new StableAgentRunError(result)
    }
    const output = result.stdout.trim()
    if (output === '') throw new Error('stable DSH Agent returned no review or adaptation result')
    return output
  } finally {
    await Promise.all(mounted.map(path => rm(path, { force: true })))
  }
}

/** Stable-version headless Agent runner for review and candidate adaptation. */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { requireCommand, runCommand, sanitizedProcessEnv } from './process.ts'

/** Exact stable CLI invocation independent from the candidate source tree. */
export interface StableCommand {
  command: string
  argsPrefix: readonly string[]
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
/**
 * Run one stable DSH headless task in an isolated working tree and Home.
 * @param options - stable CLI, candidate directory, shadow Home, and task.
 * @returns the final assistant text from stdout.
 */
export async function runStableAgent(options: StableCommand & {
  cwd: string
  shadowHome: string
  task: string
  timeoutMs: number
}): Promise<string> {
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
  requireCommand('stable DSH Agent', result)
  const output = result.stdout.trim()
  if (output === '') throw new Error('stable DSH Agent returned no review or adaptation result')
  return output
}

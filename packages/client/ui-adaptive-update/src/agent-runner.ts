/** Stable-version headless Agent runner for review and candidate adaptation. */

import { requireCommand, runCommand, sanitizedProcessEnv } from './process.ts'

/** Exact stable CLI invocation independent from the candidate source tree. */
export interface StableCommand {
  command: string
  argsPrefix: readonly string[]
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

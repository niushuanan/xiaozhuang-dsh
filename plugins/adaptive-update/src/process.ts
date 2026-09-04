/** Child-process execution with caller-selected bounds used by the detached updater. */

import { spawn } from 'node:child_process'

const MAX_CAPTURE_BYTES = 8 * 1_024 * 1_024
const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD)/iu

/** Independent facts reported for one child process. */
export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
}

/**
 * Remove credential-named variables before launching conflict-resolution and build children.
 * @param source - ambient environment to filter.
 * @returns the environment entries safe to place in detached job processes.
 */
export function sanitizedProcessEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !SECRET_NAME.test(name)))
}

/**
 * Run one child and await complete process quiescence.
 * @param command - executable name or absolute path.
 * @param args - exact argument vector.
 * @param options - working directory, environment, and timeout; null disables the timeout.
 * @returns stdout, stderr, exit, signal, and timeout as orthogonal outcomes.
 */
export async function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number | null; killGraceMs?: number },
): Promise<CommandResult> {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env ?? sanitizedProcessEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let timedOut = false
  const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
    const combined = Buffer.concat([current, chunk])
    return combined.byteLength <= MAX_CAPTURE_BYTES
      ? combined
      : combined.subarray(combined.byteLength - MAX_CAPTURE_BYTES)
  }
  child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk) })
  child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk) })
  let forcedStop: ReturnType<typeof setTimeout> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  if (options.timeoutMs !== null) {
    timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      forcedStop = setTimeout(() => { child.kill('SIGKILL') }, options.killGraceMs ?? 5_000)
      forcedStop.unref()
    }, options.timeoutMs ?? 120_000)
    timeout.unref()
  }
  const result = await new Promise<Pick<CommandResult, 'exitCode' | 'signal'>>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (exitCode, signal) => { resolve({ exitCode, signal }) })
  }).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout)
    if (forcedStop !== undefined) clearTimeout(forcedStop)
  })
  return {
    stdout: stdout.toString('utf8'),
    stderr: stderr.toString('utf8'),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut,
  }
}

/**
 * Require a successful command result.
 * @param label - operation name included in diagnostics.
 * @param result - completed command result.
 */
export function requireCommand(label: string, result: CommandResult): void {
  if (!result.timedOut && result.signal === null && result.exitCode === 0) return
  const detail = result.stderr.trim() || result.stdout.trim() || 'no output'
  throw new Error(`${label} failed (exit=${String(result.exitCode)}, signal=${String(result.signal)}, timedOut=${String(result.timedOut)}): ${detail}`)
}

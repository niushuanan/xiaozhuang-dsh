import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from '../src/process.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('continuous adaptation bounded child processes', () => {
  it('force-stops a child that ignores the graceful timeout signal', async () => {
    const result = await runCommand(process.execPath, [
      '-e',
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
    ], {
      cwd: process.cwd(),
      // Give the spawned Node process time to install its SIGTERM handler even
      // when the full thread-safe suite is starting many workers at once.
      timeoutMs: 1_000,
      killGraceMs: 50,
    })

    expect(result.timedOut).toBe(true)
    expect(result.signal).toBe('SIGKILL')
  })

  it('schedules no termination timer when the caller explicitly disables the timeout', async () => {
    vi.useFakeTimers()
    const completion = runCommand(process.execPath, ['-e', 'process.exit(0)'], {
      cwd: process.cwd(),
      timeoutMs: null as never,
    })
    const timersAfterSpawn = vi.getTimerCount()
    vi.useRealTimers()

    const result = await completion

    expect(timersAfterSpawn).toBe(0)
    expect(result).toMatchObject({ exitCode: 0, signal: null, timedOut: false })
  })
})

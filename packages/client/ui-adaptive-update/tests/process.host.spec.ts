import { describe, expect, it } from 'vitest'
import { runCommand } from '../src/process.ts'

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
})

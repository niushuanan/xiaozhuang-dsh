import { describe, expect, it } from 'vitest'
import { runCommand } from '../src/process.ts'

describe('adaptive update bounded child processes', () => {
  it('force-stops a child that ignores the graceful timeout signal', async () => {
    const result = await runCommand(process.execPath, [
      '-e',
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
    ], {
      cwd: process.cwd(),
      timeoutMs: 50,
      killGraceMs: 50,
    })

    expect(result.timedOut).toBe(true)
    expect(result.signal).toBe('SIGKILL')
  })
})

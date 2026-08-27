/**
 * PtyManager tests: when a terminal's `done` promise rejects (live transport
 * failure), the registry must mark the pty exited so the quota-release path
 * and reconnect respawn see it dead, with no unhandled rejection and an
 * idempotent close. The scheduleClose contract keeps the earliest deadline
 * (a close frame's 0-ms close beats a later reconnect grace).
 */
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { SubprocessOutcome, SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { PtyManager } from '../src/pty-manager.ts'

/** A controllable terminal stub backing a `SubprocessTerminalHandle`. */
class MockTerminal {
  readonly output = new PassThrough()
  terminated = false
  private rejectDone!: (reason: unknown) => void
  readonly done: Promise<SubprocessOutcome>

  constructor() {
    this.done = new Promise((_resolve, reject) => { this.rejectDone = reject })
  }

  reject(reason: unknown): void {
    this.rejectDone(reason)
    this.output.end()
  }

  asHandle(): SubprocessTerminalHandle {
    return {
      pid: 123,
      output: this.output,
      done: this.done,
      write: async () => {},
      inspectForeground: async () => undefined,
      signalForeground: async () => 456,
      terminate: async () => { this.terminated = true },
    }
  }
}

function makeManager(terminals: MockTerminal[]): PtyManager {
  return new PtyManager('/bin/sh', 3, [], 30_000, async (_spec: SubprocessTerminalSpawnSpec) => {
    const terminal = new MockTerminal()
    terminals.push(terminal)
    return terminal.asHandle()
  })
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('PtyManager done rejection', () => {
  it('marks the pty exited, releases quota on the next open, and closes idempotently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const terminals: MockTerminal[] = []
      const manager = makeManager(terminals)
      const first = await manager.open('s1', 't1', '/cwd', 80, 24)
      terminals[0]!.reject(new Error('transport lost'))
      await tick()
      expect(first.exited).toBe(true)
      expect(manager.get('s1:t1')?.exited).toBe(true)
      expect(warn).toHaveBeenCalledWith('[dsh-better-sidebar] terminal transport failed', expect.any(Error))

      // The exited pty no longer eats the per-session quota: the next open's
      // zombie sweep drops it and the fresh spawn succeeds.
      await manager.open('s1', 't2', '/cwd', 80, 24)
      expect(manager.keysOf('s1')).toEqual(['s1:t2'])
      expect(manager.get('s1:t1')).toBeUndefined()

      // Close is idempotent after the transport failure.
      manager.close('s1:t2')
      manager.close('s1:t2')
      expect(manager.get('s1:t2')).toBeUndefined()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('PtyManager scheduleClose', () => {
  it('keeps the earliest close deadline (a close frame beats a later grace)', async () => {
    vi.useFakeTimers()
    try {
      const manager = makeManager([])
      await manager.open('s1', 't1', '/cwd', 80, 24)
      manager.scheduleClose('s1:t1', 0)
      manager.scheduleClose('s1:t1', 30_000)
      vi.advanceTimersByTime(1)
      expect(manager.get('s1:t1')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

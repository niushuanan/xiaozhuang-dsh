// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  MAX_DSH_PANES, MultiPaneCoordinator, type MultiPaneEnvironment,
} from '../src/client/coordinator.ts'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function environment(storage = new MemoryStorage()) {
  let next = 0
  const setSplitActive = vi.fn()
  const env: MultiPaneEnvironment = {
    storage,
    randomId: () => `pane-${++next}`,
    setSplitActive,
  }
  return { env, storage, setSplitActive }
}

const id = (value: string) => value as SessionId

describe('MultiPaneCoordinator', () => {
  it('adds and closes an independent conversation pane on the current page', () => {
    const { env, setSplitActive } = environment()
    const coordinator = new MultiPaneCoordinator(env)
    coordinator.sync(id('session-1'), new Set([id('session-1'), id('session-2')]))
    coordinator.start()

    expect(coordinator.openSession(id('session-2'))).toBe('opened')
    expect(coordinator.getSnapshot()).toMatchObject({ count: 2, atLimit: false })
    expect(coordinator.getSnapshot().panes).toEqual([{ paneId: 'pane-1', sessionId: id('session-2') }])
    expect(setSplitActive).toHaveBeenLastCalledWith(true)

    coordinator.closePane('pane-1')
    expect(coordinator.getSnapshot().panes).toEqual([])
    expect(setSplitActive).toHaveBeenLastCalledWith(false)
  })

  it('keeps one copy of a session and enforces four total panes', () => {
    const { env } = environment()
    const coordinator = new MultiPaneCoordinator(env)
    const sessions = new Set(Array.from({ length: MAX_DSH_PANES + 1 }, (_, index) => id(`session-${index + 1}`)))
    coordinator.sync(id('session-1'), sessions)
    for (let index = 2; index <= MAX_DSH_PANES; index++) {
      expect(coordinator.openSession(id(`session-${index}`))).toBe('opened')
    }
    expect(coordinator.openSession(id('session-2'))).toBe('visible')
    expect(coordinator.openSession(id('session-5'))).toBe('limit')
    expect(coordinator.getSnapshot()).toMatchObject({ count: 4, atLimit: true })
  })

  it('restores panes after reload and removes invalid or newly primary sessions', () => {
    const { env, storage } = environment()
    const first = new MultiPaneCoordinator(env)
    first.sync(id('session-1'), new Set([id('session-1'), id('session-2'), id('session-3')]))
    first.openSession(id('session-2'))
    first.openSession(id('session-3'))

    const restored = new MultiPaneCoordinator(environment(storage).env)
    restored.sync(id('session-2'), new Set([id('session-2'), id('session-3')]))
    expect(restored.getSnapshot().panes.map(pane => pane.sessionId)).toEqual([id('session-3')])
  })
})

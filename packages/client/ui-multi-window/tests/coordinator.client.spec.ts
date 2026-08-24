// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  MAX_DSH_WINDOWS, MultiWindowCoordinator, type MultiWindowEnvironment,
} from '../src/client/coordinator.ts'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function environment(storage: Storage, open = vi.fn(() => ({}) as Window)) {
  let next = 0
  const intervals = new Map<number, () => void>()
  const session = new MemoryStorage()
  const env: MultiWindowEnvironment = {
    storage,
    sessionStorage: session,
    href: () => 'http://127.0.0.1:3080/?theme=dark',
    screen: () => ({ width: 1440, height: 1000 }),
    open,
    now: () => 10_000,
    randomId: () => `window-${++next}`,
    setInterval: (callback) => { const id = intervals.size + 1; intervals.set(id, callback); return id },
    clearInterval: (id) => { intervals.delete(id) },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  return { env, open }
}

describe('MultiWindowCoordinator', () => {
  it('opens the requested session in a sized auxiliary window and reserves its lease first', () => {
    const shared = new MemoryStorage()
    const { env, open } = environment(shared)
    const coordinator = new MultiWindowCoordinator(env)
    coordinator.start()
    expect(coordinator.openSession('session-2' as SessionId)).toBe('opened')
    expect(open).toHaveBeenCalledOnce()
    const [url, target, features] = open.mock.calls[0]!
    expect(url).toContain('dsh-window=auxiliary')
    expect(url).toContain('dsh-session=session-2')
    expect(target).toMatch(/^dsh-window-window-/)
    expect(features).toContain('popup=yes')
    expect(coordinator.getSnapshot().count).toBe(2)
  })

  it('enforces four total windows and does not call window.open past the cap', () => {
    const shared = new MemoryStorage()
    const { env, open } = environment(shared)
    const coordinator = new MultiWindowCoordinator(env)
    coordinator.start()
    for (let index = 1; index < MAX_DSH_WINDOWS; index++) {
      shared.setItem(`dsh.multi-window.lease.other-${index}`, '10000')
    }
    expect(coordinator.openSession('session-4' as SessionId)).toBe('limit')
    expect(open).not.toHaveBeenCalled()
    expect(coordinator.getSnapshot()).toEqual({ count: 4, atLimit: true })
  })

  it('releases a pending lease when the browser blocks the popup', () => {
    const shared = new MemoryStorage()
    const { env } = environment(shared, vi.fn(() => null))
    const coordinator = new MultiWindowCoordinator(env)
    coordinator.start()
    expect(coordinator.openSession('session-3' as SessionId)).toBe('blocked')
    expect(coordinator.getSnapshot()).toEqual({ count: 1, atLimit: false })
  })
})

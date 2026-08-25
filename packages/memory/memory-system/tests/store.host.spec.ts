import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MemoryDocumentStore } from '../src/store.ts'

describe('MemoryDocumentStore', () => {
  it('owns two fixed global documents with revision checked atomic writes', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
    const store = new MemoryDocumentStore(home)
    const initial = await store.read('user')
    expect(initial).toMatchObject({ kind: 'user', content: '', exists: false })

    const saved = await store.write('user', '## 决定\n\n优先产品主链路。', initial.revision, 'user-edit')
    expect(saved.exists).toBe(true)
    await expect(store.write('user', 'stale', initial.revision, 'user-edit'))
      .rejects.toMatchObject({ status: 409 })
    expect(await readFile(join(home, 'memory', 'user.md'), 'utf8')).toContain('产品主链路')
    expect(await store.read('ai')).toMatchObject({ kind: 'ai', content: '', exists: false })
  })

  it('keeps an internal revision and can restore the previous document', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-memory-history-'))
    const store = new MemoryDocumentStore(home)
    const first = await store.read('ai')
    const one = await store.write('ai', '第一版', first.revision, 'daily-maintenance')
    const two = await store.write('ai', '第二版', one.revision, 'daily-maintenance')
    const restored = await store.restorePrevious('ai', two.revision)
    expect(restored.content).toBe('第一版')
    expect((await readdir(join(home, 'memory', 'history'))).length).toBeGreaterThanOrEqual(2)
  })

  it('persists the daily scan cursor only after the caller commits success', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-memory-state-'))
    const store = new MemoryDocumentStore(home)
    expect(await store.readState()).toMatchObject({ lastDailyCursor: 0 })
    await store.writeState({ lastDailyCursor: 1234, lastMaintenanceAt: '2026-08-25T04:00:00.000Z' })
    await expect(store.readState()).resolves.toMatchObject({ lastDailyCursor: 1234 })
  })
})

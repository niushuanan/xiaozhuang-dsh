import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UpdateStateStore } from '../src/state.ts'

const roots: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'dsh-adaptive-state-'))
  roots.push(value)
  return value
}

describe('UpdateStateStore', () => {
  it('publishes one active job atomically with monotonic timestamps', async () => {
    const directory = await root()
    const times = [
      '2026-08-26T01:00:00.000Z',
      '2026-08-26T01:00:01.000Z',
      '2026-08-26T01:00:02.000Z',
    ]
    const store = new UpdateStateStore(directory, () => times.shift() ?? '2026-08-26T01:00:03.000Z')

    const started = await store.begin({
      jobId: 'job-1',
      currentCommit: 'a'.repeat(40),
      workerPid: 123,
    })
    expect(started).toMatchObject({
      schemaVersion: 1,
      phase: 'discovering',
      jobId: 'job-1',
      currentCommit: 'a'.repeat(40),
      startedAt: '2026-08-26T01:00:00.000Z',
      updatedAt: '2026-08-26T01:00:00.000Z',
    })

    const reviewing = await store.transition('job-1', 'reviewing', {
      upstreamCommit: 'b'.repeat(40),
    })
    expect(reviewing.updatedAt).toBe('2026-08-26T01:00:01.000Z')
    expect(reviewing.upstreamCommit).toBe('b'.repeat(40))
    expect(await readdir(directory)).toEqual(['state.json'])

    await expect(store.begin({
      jobId: 'job-2',
      currentCommit: 'c'.repeat(40),
      workerPid: 456,
    })).rejects.toThrow('a continuous adaptation is already running')
  })

  it('rejects corrupt durable state instead of guessing', async () => {
    const directory = await root()
    await writeFile(join(directory, 'state.json'), '{"phase":"completed"}\n', 'utf8')
    const store = new UpdateStateStore(directory)

    await expect(store.read()).rejects.toThrow('invalid continuous adaptation state')
  })

  it('allows a new job only after the previous job reaches a terminal phase', async () => {
    const directory = await root()
    const store = new UpdateStateStore(directory)
    await store.begin({ jobId: 'job-1', currentCommit: 'a'.repeat(40), workerPid: 123 })

    await expect(store.transition('other-job', 'failed', { error: 'wrong owner' }))
      .rejects.toThrow('continuous adaptation job does not own the current state')
    await store.transition('job-1', 'failed', { error: 'candidate failed' })
    const next = await store.begin({ jobId: 'job-2', currentCommit: 'c'.repeat(40), workerPid: 456 })

    expect(next).toMatchObject({ jobId: 'job-2', phase: 'discovering' })
  })
})

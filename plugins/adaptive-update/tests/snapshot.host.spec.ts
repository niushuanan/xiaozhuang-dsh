import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDataSnapshot, restoreDataSnapshot } from '../src/snapshot.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
describe.skipIf(process.platform !== 'darwin')('copy-on-write DSH data snapshot', () => {
  it('restores the complete pre-cutover data directory without nesting control state inside it', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-adaptive-snapshot-'))
    roots.push(parent)
    const dshHome = join(parent, '.dsh')
    const controlRoot = join(parent, '.dsh.adaptive-update')
    await mkdir(join(dshHome, 'sessions'), { recursive: true })
    await writeFile(join(dshHome, 'sessions', 'conversation.jsonl'), 'before\n', 'utf8')

    const snapshot = await createDataSnapshot(dshHome, controlRoot, 'job-1')
    await writeFile(join(dshHome, 'sessions', 'conversation.jsonl'), 'candidate\n', 'utf8')
    await restoreDataSnapshot(dshHome, snapshot, controlRoot, 'job-1')

    expect(await readFile(join(dshHome, 'sessions', 'conversation.jsonl'), 'utf8')).toBe('before\n')
    expect(snapshot.startsWith(controlRoot)).toBe(true)
  })
})

import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pruneOwnedArtifacts } from '../src/retention.ts'

const roots: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function root(prefix: string): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), prefix))
  roots.push(value)
  return value
}

describe('pruneOwnedArtifacts', () => {
  it('removes transient children, keeps one snapshot, and never follows a symlink', async () => {
    const controlRoot = await root('dsh-adaptive-owned-')
    const outside = await root('dsh-adaptive-outside-')
    await writeFile(join(outside, 'keep.txt'), 'outside', 'utf8')
    for (const name of ['reviews', 'candidates', 'shadow-homes', 'logs', 'snapshots']) {
      await mkdir(join(controlRoot, name), { recursive: true })
    }
    await mkdir(join(controlRoot, 'reviews', 'job-1'))
    await mkdir(join(controlRoot, 'candidates', 'job-1'))
    await mkdir(join(controlRoot, 'shadow-homes', 'job-1'))
    await writeFile(join(controlRoot, 'logs', 'job-1.log'), 'log', 'utf8')
    await mkdir(join(controlRoot, 'snapshots', 'old'))
    await mkdir(join(controlRoot, 'snapshots', 'previous'))
    await writeFile(join(controlRoot, 'snapshots', 'previous', 'data'), 'kept', 'utf8')
    await symlink(outside, join(controlRoot, 'reviews', 'outside-link'))

    const result = await pruneOwnedArtifacts(controlRoot, {
      keepSnapshot: join(controlRoot, 'snapshots', 'previous'),
    })

    expect(result).toEqual({ removedTransient: 5, removedSnapshots: 1 })
    expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('outside')
    expect(await readFile(join(controlRoot, 'snapshots', 'previous', 'data'), 'utf8')).toBe('kept')
  })
})

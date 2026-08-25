import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { createRepositoryReview, removeReviewWorktree } from '../src/repository.ts'

const exec = promisify(execFile)
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd, encoding: 'utf8' })
  return result.stdout.trim()
}

async function fixture(): Promise<{ repositoryRoot: string; controlRoot: string }> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'dsh-adaptive-repository-'))
  const controlRoot = await mkdtemp(join(tmpdir(), 'dsh-adaptive-control-'))
  roots.push(repositoryRoot, controlRoot)
  await git(repositoryRoot, 'init', '-b', 'master')
  await git(repositoryRoot, 'config', 'user.name', 'Adaptive Update Test')
  await git(repositoryRoot, 'config', 'user.email', 'adaptive-update@example.invalid')
  await mkdir(join(repositoryRoot, 'packages/client/plugin-a/src'), { recursive: true })
  await writeFile(join(repositoryRoot, 'packages/client/plugin-a/package.json'), '{"name":"@test/plugin-a"}\n', 'utf8')
  await writeFile(join(repositoryRoot, 'packages/client/plugin-a/src/index.ts'), 'export const value = "base"\n', 'utf8')
  await git(repositoryRoot, 'add', '.')
  await git(repositoryRoot, 'commit', '-m', 'base')
  await git(repositoryRoot, 'branch', 'upstream')

  await writeFile(join(repositoryRoot, 'packages/client/plugin-a/src/index.ts'), 'export const value = "local"\n', 'utf8')
  await mkdir(join(repositoryRoot, 'packages/client/local-only'), { recursive: true })
  await writeFile(join(repositoryRoot, 'packages/client/local-only/package.json'), '{"name":"@test/local-only"}\n', 'utf8')
  await git(repositoryRoot, 'add', '.')
  await git(repositoryRoot, 'commit', '-m', 'local product')

  await git(repositoryRoot, 'switch', 'upstream')
  await writeFile(join(repositoryRoot, 'packages/client/plugin-a/src/index.ts'), 'export const value = "official"\n', 'utf8')
  await mkdir(join(repositoryRoot, 'packages/host/apiproxy/src'), { recursive: true })
  await writeFile(join(repositoryRoot, 'packages/host/apiproxy/src/index.ts'), 'export const api = true\n', 'utf8')
  await git(repositoryRoot, 'add', '.')
  await git(repositoryRoot, 'commit', '-m', 'official product')
  await git(repositoryRoot, 'switch', 'master')
  return { repositoryRoot, controlRoot }
}

describe('createRepositoryReview', () => {
  it('pins exact commits and maps a real merge conflict to the affected plugin', async () => {
    const { repositoryRoot, controlRoot } = await fixture()

    const review = await createRepositoryReview({
      repositoryRoot,
      controlRoot,
      jobId: 'job-1',
      upstreamUrl: repositoryRoot,
      upstreamBranch: 'upstream',
    })

    expect(review.currentCommit).toMatch(/^[a-f0-9]{40}$/u)
    expect(review.upstreamCommit).toMatch(/^[a-f0-9]{40}$/u)
    expect(review.currentCommit).not.toBe(review.upstreamCommit)
    expect(review.report).toMatchObject({
      localChangedFiles: 2,
      upstreamChangedFiles: 2,
      overlappingFiles: ['packages/client/plugin-a/src/index.ts'],
      conflictFiles: ['packages/client/plugin-a/src/index.ts'],
      impactedPlugins: ['@test/plugin-a'],
      riskAreas: ['client-plugins', 'host-api'],
      review: '',
    })
    expect(await readFile(join(review.reviewPath, 'packages/client/plugin-a/src/index.ts'), 'utf8'))
      .toContain('<<<<<<< HEAD')

    await removeReviewWorktree(repositoryRoot, review.reviewPath)
    expect(await git(repositoryRoot, 'worktree', 'list', '--porcelain')).not.toContain(review.reviewPath)
  })
})

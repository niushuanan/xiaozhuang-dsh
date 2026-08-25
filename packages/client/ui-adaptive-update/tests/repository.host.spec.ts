import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCandidateWorktree, createRepositoryReview, removeReviewWorktree,
} from '../src/repository.ts'

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

  it('bypasses repository merge hooks and autostash inside the disposable review transaction', async () => {
    const { repositoryRoot: mainRoot, controlRoot } = await fixture()
    await git(mainRoot, 'switch', '-c', 'clean-upstream', 'master^')
    await mkdir(join(mainRoot, 'packages/host/clean-update'), { recursive: true })
    await writeFile(join(mainRoot, 'packages/host/clean-update/README.md'), 'official\n', 'utf8')
    await git(mainRoot, 'add', '.')
    await git(mainRoot, 'commit', '-m', 'clean official update')
    await git(mainRoot, 'switch', 'master')
    await git(mainRoot, 'config', 'extensions.worktreeConfig', 'true')
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'dsh-adaptive-source-worktree-'))
    roots.push(repositoryRoot)
    await git(mainRoot, 'worktree', 'add', '-b', 'source-worktree', repositoryRoot, 'master')
    const hooks = join(mainRoot, '.git', 'adaptive-update-test-hooks')
    await mkdir(hooks, { recursive: true })
    const hook = join(hooks, 'pre-merge-commit')
    await writeFile(hook, '#!/bin/sh\nexit 1\n', 'utf8')
    await chmod(hook, 0o755)
    await git(repositoryRoot, 'config', '--worktree', 'core.hooksPath', hooks)
    await git(repositoryRoot, 'config', '--worktree', 'merge.autoStash', 'true')

    const review = await createRepositoryReview({
      repositoryRoot,
      controlRoot,
      jobId: 'job-no-hooks',
      upstreamUrl: mainRoot,
      upstreamBranch: 'clean-upstream',
    })

    expect(review.upstreamCommit).toMatch(/^[a-f0-9]{40}$/u)
    await removeReviewWorktree(repositoryRoot, review.reviewPath)
  })

  it('removes the registered review worktree when post-merge inspection fails', async () => {
    const { repositoryRoot, controlRoot } = await fixture()
    const missing = join(repositoryRoot, 'packages/client/missing-package/src/index.ts')
    await mkdir(join(repositoryRoot, 'packages/client/missing-package/src'), { recursive: true })
    await writeFile(missing, 'export const value = "local"\n', 'utf8')
    await git(repositoryRoot, 'add', '.')
    await git(repositoryRoot, 'commit', '-m', 'local missing package path')
    await git(repositoryRoot, 'switch', 'upstream')
    await mkdir(join(repositoryRoot, 'packages/client/missing-package/src'), { recursive: true })
    await writeFile(missing, 'export const value = "official"\n', 'utf8')
    await git(repositoryRoot, 'add', '.')
    await git(repositoryRoot, 'commit', '-m', 'official missing package path')
    await git(repositoryRoot, 'switch', 'master')

    await expect(createRepositoryReview({
      repositoryRoot,
      controlRoot,
      jobId: 'job-cleanup',
      upstreamUrl: repositoryRoot,
      upstreamBranch: 'upstream',
    })).rejects.toThrow(/package\.json/u)

    expect(await git(repositoryRoot, 'worktree', 'list', '--porcelain'))
      .not.toContain(join(controlRoot, 'reviews', 'job-cleanup'))
  })

  it('removes candidate worktree and branch when the pinned merge cannot start', async () => {
    const { repositoryRoot, controlRoot } = await fixture()
    const currentCommit = await git(repositoryRoot, 'rev-parse', 'HEAD')

    await expect(createCandidateWorktree({
      repositoryRoot,
      controlRoot,
      jobId: 'job-candidate-cleanup',
    }, currentCommit, 'not-a-commit')).rejects.toThrow(/candidate merge/u)

    const worktrees = await git(repositoryRoot, 'worktree', 'list', '--porcelain')
    expect(worktrees).not.toContain(join(controlRoot, 'candidates', 'job-candidate-cleanup'))
    expect(await git(repositoryRoot, 'branch', '--list', 'adaptive-update/job-candidate-cleanup')).toBe('')
  })
})

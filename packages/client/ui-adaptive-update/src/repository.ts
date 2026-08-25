/** Exact-ref Git inspection and disposable review worktree lifecycle. */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { requireCommand, runCommand, type CommandResult } from './process.ts'
import { impactedPluginNames, riskAreasFor } from './review.ts'
import type { CompatibilityReport } from './types.ts'

const JOB_ID = /^[a-z0-9][a-z0-9-]{0,79}$/u

async function git(repositoryRoot: string, args: readonly string[], timeoutMs = 120_000): Promise<string> {
  const result = await runCommand('git', args, { cwd: repositoryRoot, timeoutMs })
  requireCommand(`git ${args[0] ?? ''}`, result)
  return result.stdout.trim()
}

function lines(value: string): string[] {
  return value === '' ? [] : value.split('\n').map(line => line.trim()).filter(Boolean).sort()
}

async function refreshCleanWorktree(worktreePath: string): Promise<void> {
  const content = await runCommand('git', ['diff', '--quiet', '--'], {
    cwd: worktreePath,
    timeoutMs: 120_000,
  })
  requireCommand('git disposable worktree content check', content)
  let indexCheck: CommandResult | undefined
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await git(worktreePath, ['update-index', '--really-refresh'])
    indexCheck = await runCommand('git', ['diff-index', '--quiet', 'HEAD', '--'], {
      cwd: worktreePath,
      timeoutMs: 120_000,
    })
    if (indexCheck.exitCode === 0) break
    await delay(1_000)
  }
  if (indexCheck === undefined) throw new Error('adaptive update could not inspect disposable worktree')
  requireCommand('git disposable worktree index check', indexCheck)
  const status = await git(worktreePath, ['status', '--porcelain'])
  if (status !== '') throw new Error('adaptive update disposable worktree was not created cleanly')
}

async function requireMergeStarted(label: string, cwd: string, result: CommandResult): Promise<void> {
  if (result.timedOut || result.signal !== null || (result.exitCode !== 0 && result.exitCode !== 1)) {
    requireCommand(label, result)
  }
  if (result.exitCode === 1) {
    const mergeHead = await runCommand('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], {
      cwd,
      timeoutMs: 30_000,
    })
    if (mergeHead.exitCode !== 0) requireCommand(label, result)
  }
}

async function cleanupRegisteredWorktree(
  repositoryRoot: string,
  path: string,
  branch?: string,
): Promise<void> {
  await git(repositoryRoot, ['worktree', 'remove', '--force', path], 300_000)
  if (branch !== undefined) await git(repositoryRoot, ['branch', '-D', branch])
  await git(repositoryRoot, ['worktree', 'prune'])
}

/** Result of the deterministic trial merge performed before semantic review. */
export interface RepositoryReview {
  reviewPath: string
  currentCommit: string
  upstreamCommit: string
  upstreamRef: string
  report: CompatibilityReport
}

/**
 * Create the adaptation worktree and repeat the exact pinned trial merge.
 * @param options - repository, control root, and job identity.
 * @param currentCommit - local product commit containing the updater.
 * @param upstreamCommit - exact official commit already reviewed.
 * @returns candidate worktree path.
 */
export async function createCandidateWorktree(
  options: { repositoryRoot: string; controlRoot: string; jobId: string },
  currentCommit: string,
  upstreamCommit: string,
): Promise<string> {
  if (!JOB_ID.test(options.jobId)) throw new Error('invalid adaptive update job id')
  const candidatePath = join(options.controlRoot, 'candidates', options.jobId)
  await mkdir(join(options.controlRoot, 'candidates'), { recursive: true, mode: 0o700 })
  await git(options.repositoryRoot, [
    'worktree', 'add', '-b', `adaptive-update/${options.jobId}`, candidatePath, currentCommit,
  ], 300_000)
  const branch = `adaptive-update/${options.jobId}`
  try {
    await refreshCleanWorktree(candidatePath)
    const merge = await runCommand('git', [
      '-c', 'core.hooksPath=/dev/null',
      'merge', '--no-autostash', '--no-verify', '--no-commit', '--no-ff', upstreamCommit,
    ], {
      cwd: candidatePath,
      timeoutMs: 300_000,
    })
    await requireMergeStarted('git candidate merge', candidatePath, merge)
    return candidatePath
  } catch (error) {
    await cleanupRegisteredWorktree(options.repositoryRoot, candidatePath, branch)
    throw error
  }
}

/**
 * Require the stable Agent to leave a resolved, uncommitted candidate merge.
 * @param candidatePath - adaptation worktree.
 * @param currentCommit - original local product commit.
 */
export async function assertCandidateResolved(candidatePath: string, currentCommit: string): Promise<void> {
  const head = await git(candidatePath, ['rev-parse', 'HEAD'])
  if (head !== currentCommit) throw new Error('adaptive update Agent committed or moved the candidate branch')
  const unresolved = lines(await git(candidatePath, ['diff', '--name-only', '--diff-filter=U']))
  if (unresolved.length > 0) {
    throw new Error(`adaptive update candidate still has unresolved files: ${unresolved.join(', ')}`)
  }
  const diffCheck = await runCommand('git', ['diff', '--check'], { cwd: candidatePath, timeoutMs: 120_000 })
  requireCommand('git candidate diff check', diffCheck)
}

/**
 * Pin upstream, compute two-sided changes, and leave a disposable trial merge
 * for the stable Agent's semantic review.
 * @param options - exact repository, control root, job, and upstream source.
 * @returns pinned commits, review worktree, and deterministic report.
 */
export async function createRepositoryReview(options: {
  repositoryRoot: string
  controlRoot: string
  jobId: string
  upstreamUrl: string
  upstreamBranch: string
}): Promise<RepositoryReview> {
  if (!JOB_ID.test(options.jobId)) throw new Error('invalid adaptive update job id')
  const currentCommit = await git(options.repositoryRoot, ['rev-parse', 'HEAD'])
  const status = await git(options.repositoryRoot, ['status', '--porcelain'])
  if (status !== '') throw new Error('adaptive update requires a clean source checkout')

  const upstreamRef = `refs/dsh-adaptive-update/${options.jobId}/upstream`
  await git(options.repositoryRoot, [
    'fetch', '--force', '--no-tags', options.upstreamUrl,
    `refs/heads/${options.upstreamBranch}:${upstreamRef}`,
  ], 300_000)
  const upstreamCommit = await git(options.repositoryRoot, ['rev-parse', upstreamRef])
  const mergeBase = await git(options.repositoryRoot, ['merge-base', currentCommit, upstreamCommit])
  const localFiles = lines(await git(options.repositoryRoot, ['diff', '--name-only', `${mergeBase}..${currentCommit}`]))
  const upstreamFiles = lines(await git(options.repositoryRoot, ['diff', '--name-only', `${mergeBase}..${upstreamCommit}`]))
  const upstreamSet = new Set(upstreamFiles)
  const overlappingFiles = localFiles.filter(path => upstreamSet.has(path))

  const reviewPath = join(options.controlRoot, 'reviews', options.jobId)
  await mkdir(join(options.controlRoot, 'reviews'), { recursive: true, mode: 0o700 })
  await git(options.repositoryRoot, ['worktree', 'add', '--detach', reviewPath, currentCommit], 300_000)
  try {
    await refreshCleanWorktree(reviewPath)
    const merge = await runCommand('git', [
      '-c', 'core.hooksPath=/dev/null',
      'merge', '--no-autostash', '--no-verify', '--no-commit', '--no-ff', upstreamCommit,
    ], {
      cwd: reviewPath,
      timeoutMs: 300_000,
    })
    await requireMergeStarted('git trial merge', reviewPath, merge)
    const conflictFiles = lines(await git(reviewPath, ['diff', '--name-only', '--diff-filter=U']))
    const impactedPlugins = await impactedPluginNames(options.repositoryRoot, [...overlappingFiles, ...conflictFiles])
    const riskAreas = riskAreasFor([...localFiles, ...upstreamFiles])
    return {
      reviewPath,
      currentCommit,
      upstreamCommit,
      upstreamRef,
      report: {
        mergeBase,
        localChangedFiles: localFiles.length,
        upstreamChangedFiles: upstreamFiles.length,
        overlappingFiles,
        conflictFiles,
        impactedPlugins,
        riskAreas,
        review: '',
      },
    }
  } catch (error) {
    await cleanupRegisteredWorktree(options.repositoryRoot, reviewPath)
    throw error
  }
}

/**
 * Remove one registered review worktree without following paths inside it.
 * @param repositoryRoot - source checkout owning the worktree registry.
 * @param reviewPath - exact registered review path.
 */
export async function removeReviewWorktree(repositoryRoot: string, reviewPath: string): Promise<void> {
  await git(repositoryRoot, ['worktree', 'remove', '--force', reviewPath], 300_000)
  await git(repositoryRoot, ['worktree', 'prune'])
}

/**
 * Remove a registered candidate worktree and its temporary branch.
 * @param repositoryRoot - source checkout owning the worktree registry.
 * @param candidatePath - exact registered candidate worktree path.
 * @param jobId - operation identity used by the temporary branch.
 */
export async function removeCandidateWorktree(
  repositoryRoot: string,
  candidatePath: string,
  jobId: string,
): Promise<void> {
  await git(repositoryRoot, ['worktree', 'remove', '--force', candidatePath], 300_000)
  await git(repositoryRoot, ['branch', '-D', `adaptive-update/${jobId}`])
  await git(repositoryRoot, ['worktree', 'prune'])
}

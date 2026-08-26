/** Conflict-focused preparation shared by the detached worker and unit tests. */

import type { StableCommand } from './agent-runner.ts'
import type { RepositoryReview } from './repository.ts'
import type { CompatibilityReport, UpdatePhase } from './types.ts'

/** Inputs fixed before the detached operation begins. */
export interface PreparationOptions {
  repositoryRoot: string
  controlRoot: string
  realHome: string
  shadowHome: string
  jobId: string
  upstreamUrl: string
  upstreamBranch: string
  stableCommand: StableCommand
}
/** Injectable operation edges; real implementations use Git and stable DSH. */
export interface PreparationDependencies {
  createReview: (options: PreparationOptions) => Promise<RepositoryReview>
  removeReview: (repositoryRoot: string, reviewPath: string) => Promise<void>
  createCandidate: (
    options: PreparationOptions,
    currentCommit: string,
    upstreamCommit: string,
  ) => Promise<string>
  runAgent: (options: {
    cwd: string
    shadowHome: string
    stableCommand: StableCommand
    report: CompatibilityReport
  }) => Promise<string>
  assertCandidateResolved: (candidatePath: string, currentCommit: string) => Promise<void>
  publish: (phase: UpdatePhase, patch?: Record<string, unknown>) => Promise<void>
}

/** Candidate and report produced before deterministic validation begins. */
export interface PreparedCandidate {
  candidatePath: string
  currentCommit: string
  upstreamCommit: string
  report: CompatibilityReport
}

/**
 * Inspect a disposable trial merge, then adapt only real conflicts in a second worktree.
 * @param options - immutable job inputs.
 * @param dependencies - real or scripted operation edges.
 * @returns the resolved candidate and deterministic conflict inventory.
 */
export async function prepareUpdateCandidate(
  options: PreparationOptions,
  dependencies: PreparationDependencies,
): Promise<PreparedCandidate> {
  const review = await dependencies.createReview(options)
  const report = review.report
  await dependencies.publish('reviewing', {
    upstreamCommit: review.upstreamCommit,
    report,
  })
  await dependencies.removeReview(options.repositoryRoot, review.reviewPath)

  const candidatePath = await dependencies.createCandidate(
    options,
    review.currentCommit,
    review.upstreamCommit,
  )
  await dependencies.publish('adapting', { report })
  if (report.conflictFiles.length > 0) {
    await dependencies.runAgent({
      cwd: candidatePath,
      shadowHome: options.shadowHome,
      stableCommand: options.stableCommand,
      report,
    })
  }
  await dependencies.assertCandidateResolved(candidatePath, review.currentCommit)
  return {
    candidatePath,
    currentCommit: review.currentCommit,
    upstreamCommit: review.upstreamCommit,
    report,
  }
}

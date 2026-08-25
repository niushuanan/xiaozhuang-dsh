/** Review-first preparation shared by the detached worker and unit tests. */

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
    mode: 'review' | 'adapt'
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
 * Review a disposable trial merge, discard it, then adapt a second worktree.
 * @param options - immutable job inputs.
 * @param dependencies - real or scripted operation edges.
 * @returns the resolved candidate and completed semantic report.
 */
export async function prepareUpdateCandidate(
  options: PreparationOptions,
  dependencies: PreparationDependencies,
): Promise<PreparedCandidate> {
  const review = await dependencies.createReview(options)
  let report = review.report
  await dependencies.publish('reviewing', {
    upstreamCommit: review.upstreamCommit,
    report,
  })
  try {
    const semanticReview = await dependencies.runAgent({
      mode: 'review',
      cwd: review.reviewPath,
      shadowHome: options.shadowHome,
      stableCommand: options.stableCommand,
      report,
    })
    report = { ...report, review: semanticReview }
    await dependencies.publish('reviewing', { report })
  } finally {
    await dependencies.removeReview(options.repositoryRoot, review.reviewPath)
  }

  const candidatePath = await dependencies.createCandidate(
    options,
    review.currentCommit,
    review.upstreamCommit,
  )
  await dependencies.publish('adapting', { report })
  await dependencies.runAgent({
    mode: 'adapt',
    cwd: candidatePath,
    shadowHome: options.shadowHome,
    stableCommand: options.stableCommand,
    report,
  })
  await dependencies.assertCandidateResolved(candidatePath, review.currentCommit)
  return {
    candidatePath,
    currentCommit: review.currentCommit,
    upstreamCommit: review.upstreamCommit,
    report,
  }
}

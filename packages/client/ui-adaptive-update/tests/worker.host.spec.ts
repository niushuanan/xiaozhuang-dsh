import { describe, expect, it, vi } from 'vitest'
import { prepareUpdateCandidate, type PreparationDependencies } from '../src/worker.ts'
import type { RepositoryReview } from '../src/repository.ts'

const review: RepositoryReview = {
  reviewPath: '/control/reviews/job-1',
  currentCommit: 'a'.repeat(40),
  upstreamCommit: 'b'.repeat(40),
  upstreamRef: 'refs/dsh-adaptive-update/job-1/upstream',
  report: {
    mergeBase: 'c'.repeat(40),
    localChangedFiles: 10,
    upstreamChangedFiles: 12,
    overlappingFiles: ['packages/client/plugin-a/src/index.ts'],
    conflictFiles: ['packages/client/plugin-a/src/index.ts'],
    impactedPlugins: ['@test/plugin-a'],
    riskAreas: ['client-plugins'],
    review: '',
  },
}

function dependencies(overrides: Partial<PreparationDependencies> = {}) {
  const calls: string[] = []
  const deps: PreparationDependencies = {
    createReview: vi.fn(async () => { calls.push('create-review'); return review }),
    removeReview: vi.fn(async () => { calls.push('remove-review') }),
    createCandidate: vi.fn(async () => { calls.push('create-candidate'); return '/control/candidates/job-1' }),
    runAgent: vi.fn(async ({ mode }) => {
      calls.push(`agent-${mode}`)
      return mode === 'review' ? '语义审查报告' : '候选适配完成'
    }),
    assertCandidateResolved: vi.fn(async () => { calls.push('assert-resolved') }),
    publish: vi.fn(async (phase) => { calls.push(`publish-${phase}`) }),
    ...overrides,
  }
  return { deps, calls }
}

describe('prepareUpdateCandidate', () => {
  it('discards the review tree before adapting a separate candidate tree', async () => {
    const { deps, calls } = dependencies()

    const result = await prepareUpdateCandidate({
      repositoryRoot: '/repo',
      controlRoot: '/control',
      realHome: '/home',
      shadowHome: '/control/shadow-homes/job-1',
      jobId: 'job-1',
      upstreamUrl: 'https://example.invalid/upstream.git',
      upstreamBranch: 'master',
      stableCommand: { command: 'node', argsPrefix: ['stable-cli.js'] },
    }, deps)

    expect(result).toEqual({
      candidatePath: '/control/candidates/job-1',
      currentCommit: review.currentCommit,
      upstreamCommit: review.upstreamCommit,
      report: { ...review.report, review: '语义审查报告' },
    })
    expect(calls).toEqual([
      'create-review',
      'publish-reviewing',
      'agent-review',
      'publish-reviewing',
      'remove-review',
      'create-candidate',
      'publish-adapting',
      'agent-adapt',
      'assert-resolved',
    ])
    expect(review.reviewPath).not.toBe(result.candidatePath)
  })

  it('never creates a candidate when semantic review fails', async () => {
    const { deps } = dependencies({
      runAgent: vi.fn(async () => { throw new Error('review model unavailable') }),
    })

    await expect(prepareUpdateCandidate({
      repositoryRoot: '/repo',
      controlRoot: '/control',
      realHome: '/home',
      shadowHome: '/control/shadow-homes/job-1',
      jobId: 'job-1',
      upstreamUrl: 'https://example.invalid/upstream.git',
      upstreamBranch: 'master',
      stableCommand: { command: 'node', argsPrefix: ['stable-cli.js'] },
    }, deps)).rejects.toThrow('review model unavailable')

    expect(deps.removeReview).toHaveBeenCalledWith('/repo', review.reviewPath)
    expect(deps.createCandidate).not.toHaveBeenCalled()
  })
})

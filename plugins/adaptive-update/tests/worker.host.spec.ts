import { describe, expect, it, vi } from 'vitest'
import type { RepositoryReview } from '../src/repository.ts'
import type { CompatibilityReport } from '../src/types.ts'
import {
  prepareUpdateCandidate, type PreparationDependencies, type PreparationOptions,
} from '../src/worker.ts'

const options: PreparationOptions = {
  repositoryRoot: '/repo',
  controlRoot: '/control',
  realHome: '/home/.dsh',
  shadowHome: '/control/shadow-homes/job-1',
  jobId: 'job-1',
  upstreamUrl: 'https://github.com/deepseek-ai/deepseek-harness.git',
  upstreamBranch: 'master',
  stableCommand: { command: '/usr/bin/node', argsPrefix: ['/repo/apps/cli/src/bin.ts'] },
}

function report(conflictFiles: readonly string[]): CompatibilityReport {
  return {
    mergeBase: '0'.repeat(40),
    localChangedFiles: 2,
    upstreamChangedFiles: 3,
    overlappingFiles: ['packages/client/plugin-a/src/index.ts'],
    conflictFiles,
    impactedPlugins: ['@test/plugin-a'],
    riskAreas: ['client-plugins'],
  }
}

function dependencies(reviewReport: CompatibilityReport) {
  const calls: string[] = []
  const review: RepositoryReview = {
    reviewPath: '/control/reviews/job-1',
    currentCommit: 'a'.repeat(40),
    upstreamCommit: 'b'.repeat(40),
    upstreamRef: 'refs/dsh-adaptive-update/job-1/upstream',
    report: reviewReport,
  }
  const deps: PreparationDependencies = {
    createReview: vi.fn(async () => { calls.push('review'); return review }),
    removeReview: vi.fn(async () => { calls.push('remove-review') }),
    createCandidate: vi.fn(async () => { calls.push('candidate'); return '/control/candidates/job-1' }),
    runAgent: vi.fn(async () => { calls.push('agent'); return 'compatible' }),
    assertCandidateResolved: vi.fn(async () => { calls.push('resolved') }),
    publish: vi.fn(async (phase) => { calls.push(`publish-${phase}`) }),
  }
  return { calls, deps }
}

describe('prepareUpdateCandidate', () => {
  it('runs a five-minute narrow compatibility Agent after a conflict-free candidate exists', async () => {
    const { calls, deps } = dependencies(report([]))

    await prepareUpdateCandidate(options, deps)

    expect(calls).toEqual([
      'review', 'publish-reviewing', 'remove-review', 'candidate', 'publish-adapting', 'agent', 'resolved',
    ])
    expect(deps.runAgent).toHaveBeenCalledWith(expect.objectContaining({
      cwd: '/control/candidates/job-1',
      timeoutMs: 5 * 60_000,
      task: expect.stringContaining('Git 无冲突'),
    }))
    const task = (deps.runAgent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].task as string
    expect(task).toContain('packages/client/plugin-a/src/index.ts')
    expect(task).toContain('@test/plugin-a')
    expect(task).toContain('兼容则不修改任何文件')
    expect(task).toContain('不要运行测试、回放、构建或依赖安装')
    expect(task).toContain('不修改文档、不重构')
  })

  it('runs conflict adaptation without a timeout and limits work to conflicts plus direct compile dependencies', async () => {
    const conflict = 'packages/client/plugin-a/src/index.ts'
    const { calls, deps } = dependencies(report([conflict]))

    await prepareUpdateCandidate(options, deps)

    expect(calls.indexOf('candidate')).toBeLessThan(calls.indexOf('agent'))
    expect(deps.runAgent).toHaveBeenCalledWith(expect.objectContaining({
      timeoutMs: null,
      task: expect.stringContaining('不设超时'),
    }))
    const task = (deps.runAgent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].task as string
    expect(task).toContain(conflict)
    expect(task).toContain('实际冲突文件及其直接编译依赖')
    expect(task).toContain('不做全仓审查')
  })
})

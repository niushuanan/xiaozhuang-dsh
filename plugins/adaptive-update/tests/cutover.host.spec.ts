import { describe, expect, it, vi } from 'vitest'
import {
  applyCandidate, recoverInterruptedCutover, type CutoverDependencies,
} from '../src/cutover.ts'

const options = {
  repositoryRoot: '/repo',
  dshHome: '/home/.dsh',
  controlRoot: '/home/.dsh.adaptive-update',
  jobId: 'job-1',
  currentCommit: 'a'.repeat(40),
  candidateCommit: 'b'.repeat(40),
  currentPid: 123,
}

function dependencies(overrides: Partial<CutoverDependencies> = {}) {
  const calls: string[] = []
  const deps: CutoverDependencies = {
    isCheckoutClean: vi.fn(async () => true),
    waitForIdle: vi.fn(async () => { calls.push('idle') }),
    stopCurrent: vi.fn(async () => { calls.push('stop-current') }),
    createSnapshot: vi.fn(async () => { calls.push('snapshot'); return '/snapshot/job-1' }),
    advanceCheckout: vi.fn(async (_root, commit) => { calls.push(`checkout-${commit[0]}`) }),
    waitForReadiness: vi.fn(async () => { calls.push('readiness'); return true }),
    spawnRuntime: vi.fn(async () => { calls.push('spawn'); return 456 }),
    stopCandidate: vi.fn(async () => { calls.push('stop-candidate') }),
    restoreSnapshot: vi.fn(async () => { calls.push('restore-data') }),
    ...overrides,
  }
  return { deps, calls }
}

describe('applyCandidate', () => {
  it('refuses a dirty checkout before stopping the usable product', async () => {
    const { deps } = dependencies({ isCheckoutClean: vi.fn(async () => false) })

    await expect(applyCandidate(options, deps)).rejects.toThrow('clean source checkout')
    expect(deps.stopCurrent).not.toHaveBeenCalled()
    expect(deps.createSnapshot).not.toHaveBeenCalled()
  })

  it('uses an external supervisor restart without spawning a duplicate', async () => {
    const { deps, calls } = dependencies()

    const result = await applyCandidate(options, deps)

    expect(result).toEqual({ status: 'completed', snapshotPath: '/snapshot/job-1' })
    expect(calls).toEqual(['idle', 'stop-current', 'snapshot', 'checkout-b', 'readiness'])
    expect(deps.spawnRuntime).not.toHaveBeenCalled()
  })

  it('spawns the verified runtime when no supervisor restarts it', async () => {
    let probes = 0
    const { deps, calls } = dependencies()
    deps.waitForReadiness = vi.fn(async () => {
      calls.push('readiness')
      probes += 1
      return probes === 2
    })

    const result = await applyCandidate(options, deps)

    expect(result.status).toBe('completed')
    expect(calls).toEqual(['idle', 'stop-current', 'snapshot', 'checkout-b', 'readiness', 'spawn', 'readiness'])
  })

  it('restores code and data when real readiness fails', async () => {
    let probes = 0
    const { deps, calls } = dependencies()
    deps.waitForReadiness = vi.fn(async () => {
      calls.push('readiness')
      probes += 1
      return probes === 3
    })

    const result = await applyCandidate(options, deps)

    expect(result).toEqual({ status: 'rolled-back', snapshotPath: '/snapshot/job-1' })
    expect(calls).toEqual([
      'idle', 'stop-current', 'snapshot', 'checkout-b', 'readiness', 'spawn', 'readiness',
      'stop-candidate', 'checkout-a', 'restore-data', 'spawn', 'readiness',
    ])
  })

  it('restarts the unchanged product when the stopped-data snapshot cannot be created', async () => {
    const { deps, calls } = dependencies({
      createSnapshot: vi.fn(async () => { calls.push('snapshot'); throw new Error('clone unsupported') }),
    })

    const result = await applyCandidate(options, deps)

    expect(result).toEqual({ status: 'rolled-back', snapshotPath: '' })
    expect(calls).toEqual(['idle', 'stop-current', 'snapshot', 'spawn', 'readiness'])
    expect(deps.advanceCheckout).not.toHaveBeenCalled()
  })

  it('restores the previous product when cutover throws after the snapshot', async () => {
    const { deps, calls } = dependencies({
      advanceCheckout: vi.fn(async (_root, commit) => {
        calls.push(`checkout-${commit[0]}`)
        if (commit === options.candidateCommit) throw new Error('checkout failed')
      }),
    })

    const result = await applyCandidate(options, deps)

    expect(result).toEqual({ status: 'rolled-back', snapshotPath: '/snapshot/job-1' })
    expect(calls).toEqual([
      'idle', 'stop-current', 'snapshot', 'checkout-b', 'stop-candidate',
      'checkout-a', 'restore-data', 'spawn', 'readiness',
    ])
  })

  it('recovers an interrupted applying phase after the candidate checkout became current', async () => {
    let probes = 0
    const { deps, calls } = dependencies()
    deps.waitForReadiness = vi.fn(async () => {
      calls.push('readiness')
      probes += 1
      return probes === 2
    })
    const currentHead = vi.fn(async () => options.candidateCommit)

    const result = await recoverInterruptedCutover({
      ...options,
      snapshotPath: '/snapshot/job-1',
    }, { ...deps, currentHead })

    expect(result.status).toBe('rolled-back')
    expect(calls).toEqual([
      'readiness', 'stop-candidate', 'checkout-a', 'restore-data', 'spawn', 'readiness',
    ])
  })
})

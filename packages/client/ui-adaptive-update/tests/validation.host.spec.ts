import { describe, expect, it, vi } from 'vitest'
import {
  validateCandidate, validateCandidateWithRepairs, type ValidationDependencies,
} from '../src/validation.ts'

function dependencies(overrides: Partial<ValidationDependencies> = {}): ValidationDependencies {
  return {
    unresolvedFiles: vi.fn(async () => []),
    runCheck: vi.fn(async check => ({ ...check, status: 'passed' as const })),
    bootShadow: vi.fn(async () => ({ hostReady: true, clientReady: true, detail: 'ready' })),
    publishChecks: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('validateCandidate', () => {
  it('requires every deterministic check plus Host and Client readiness', async () => {
    const deps = dependencies()

    const result = await validateCandidate('/candidate', deps)

    expect(result.map(check => check.id)).toEqual([
      'install', 'plugin-tests', 'typecheck', 'build', 'web-replay', 'shadow-host', 'shadow-client',
    ])
    expect(result.every(check => check.status === 'passed')).toBe(true)
  })

  it.each([
    ['unresolved merge', dependencies({ unresolvedFiles: vi.fn(async () => ['conflict.ts']) }), 'unresolved files'],
    ['failed command', dependencies({
      runCheck: vi.fn(async check => check.id === 'build'
        ? { ...check, status: 'failed' as const, detail: 'build failed' }
        : { ...check, status: 'passed' as const }),
    }), 'build failed'],
    ['Host not ready', dependencies({
      bootShadow: vi.fn(async () => ({ hostReady: false, clientReady: false, detail: 'no server' })),
    }), 'no server'],
    ['Client not ready', dependencies({
      bootShadow: vi.fn(async () => ({ hostReady: true, clientReady: false, detail: 'asset failed' })),
    }), 'asset failed'],
  ])('blocks cutover for %s', async (_name, deps, message) => {
    await expect(validateCandidate('/candidate', deps)).rejects.toThrow(message)
  })

  it('feeds one failed validation back into candidate repair and reruns every gate', async () => {
    let repaired = false
    const deps = dependencies({
      runCheck: vi.fn(async check => check.id === 'web-replay' && !repaired
        ? { ...check, status: 'failed' as const, detail: '69 replay failures' }
        : { ...check, status: 'passed' as const }),
    })
    const repair = vi.fn(async () => { repaired = true })

    const result = await validateCandidateWithRepairs('/candidate', deps, repair, 2)

    expect(result.every(check => check.status === 'passed')).toBe(true)
    expect(repair).toHaveBeenCalledWith('69 replay failures', 1)
    expect(deps.runCheck).toHaveBeenCalledTimes(10)
  })

  it('stops after the bounded number of candidate repair attempts', async () => {
    const deps = dependencies({
      runCheck: vi.fn(async check => check.id === 'build'
        ? { ...check, status: 'failed' as const, detail: 'build still fails' }
        : { ...check, status: 'passed' as const }),
    })
    const repair = vi.fn(async () => undefined)

    await expect(validateCandidateWithRepairs('/candidate', deps, repair, 2))
      .rejects.toThrow('build still fails')
    expect(repair).toHaveBeenCalledTimes(2)
  })
})

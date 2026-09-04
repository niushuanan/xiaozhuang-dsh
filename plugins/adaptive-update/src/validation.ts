/** Minimal candidate checks required before source or data cutover. */

import type { UpdateCheckResult } from './types.ts'

const CHECKS: readonly UpdateCheckResult[] = [
  { id: 'install', label: '准备新版依赖', status: 'pending' },
  { id: 'build', label: '确认新版可构建', status: 'pending' },
]

class CandidateCheckError extends Error {
  constructor(readonly checkId: string, message: string) {
    super(message)
  }
}

/** Injectable candidate-validation operations. */
export interface ValidationDependencies {
  unresolvedFiles: (candidatePath: string) => Promise<readonly string[]>
  runCheck: (check: UpdateCheckResult, candidatePath: string) => Promise<UpdateCheckResult>
  publishChecks: (checks: readonly UpdateCheckResult[]) => Promise<void>
}
/**
 * Require merge resolution, dependency preparation, and one production build.
 * @param candidatePath - isolated candidate worktree.
 * @param dependencies - concrete minimal build operations.
 * @returns the complete passing check list.
 */
export async function validateCandidate(
  candidatePath: string,
  dependencies: ValidationDependencies,
): Promise<readonly UpdateCheckResult[]> {
  const unresolved = await dependencies.unresolvedFiles(candidatePath)
  if (unresolved.length > 0) throw new Error(`candidate has unresolved files: ${unresolved.join(', ')}`)
  const completed: UpdateCheckResult[] = []
  for (const check of CHECKS) {
    await dependencies.publishChecks([...completed, { ...check, status: 'running' }])
    const result = await dependencies.runCheck(check, candidatePath)
    completed.push(result)
    await dependencies.publishChecks(completed)
    if (result.status !== 'passed') {
      throw new CandidateCheckError(check.id, result.detail ?? `${result.label} failed`)
    }
  }
  return completed
}

/**
 * Re-open candidate adaptation when a real validation gate finds a problem.
 * One build failure may return to a narrowly scoped compatibility repair.
 * @param candidatePath - isolated candidate worktree.
 * @param dependencies - concrete validation operations.
 * @param repair - stable Agent repair callback receiving failure evidence.
 * @param maxRepairs - bounded repair attempts before the update safely fails.
 * @returns the complete passing check list.
 */
export async function validateCandidateWithRepairs(
  candidatePath: string,
  dependencies: ValidationDependencies,
  repair: (failure: string, attempt: number) => Promise<void>,
  maxRepairs = 2,
): Promise<readonly UpdateCheckResult[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await validateCandidate(candidatePath, dependencies)
    } catch (error) {
      if (!(error instanceof CandidateCheckError) || error.checkId !== 'build' || attempt >= maxRepairs) throw error
      const failure = error instanceof Error ? error.message : String(error)
      await repair(failure, attempt + 1)
    }
  }
}

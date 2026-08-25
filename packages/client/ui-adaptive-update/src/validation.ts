/** Candidate checks that must all pass before source or data cutover. */

import type { UpdateCheckResult } from './types.ts'

const CHECKS: readonly UpdateCheckResult[] = [
  { id: 'install', label: '依赖一致性', status: 'pending' },
  { id: 'plugin-tests', label: '自适应更新回归', status: 'pending' },
  { id: 'typecheck', label: 'Host 与 Client 类型检查', status: 'pending' },
  { id: 'build', label: '生产构建', status: 'pending' },
  { id: 'web-replay', label: 'Web 回放验证', status: 'pending' },
]

/** Injectable candidate-validation operations. */
export interface ValidationDependencies {
  unresolvedFiles: (candidatePath: string) => Promise<readonly string[]>
  runCheck: (check: UpdateCheckResult, candidatePath: string) => Promise<UpdateCheckResult>
  bootShadow: (candidatePath: string) => Promise<{ hostReady: boolean; clientReady: boolean; detail: string }>
  publishChecks: (checks: readonly UpdateCheckResult[]) => Promise<void>
}
/**
 * Require merge resolution, deterministic commands, and both readiness planes.
 * @param candidatePath - isolated candidate worktree.
 * @param dependencies - concrete command and shadow-boot operations.
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
    if (result.status !== 'passed') throw new Error(result.detail ?? `${result.label} failed`)
  }
  const boot = await dependencies.bootShadow(candidatePath)
  const host: UpdateCheckResult = {
    id: 'shadow-host',
    label: '候选 Host 就绪',
    status: boot.hostReady ? 'passed' : 'failed',
    detail: boot.detail,
  }
  completed.push(host)
  await dependencies.publishChecks(completed)
  if (!boot.hostReady) throw new Error(boot.detail)
  const client: UpdateCheckResult = {
    id: 'shadow-client',
    label: '候选 Client 就绪',
    status: boot.clientReady ? 'passed' : 'failed',
    detail: boot.detail,
  }
  completed.push(client)
  await dependencies.publishChecks(completed)
  if (!boot.clientReady) throw new Error(boot.detail)
  return completed
}

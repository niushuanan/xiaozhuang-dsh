/** Durable phases of one continuous-adaptation operation. */
export type UpdatePhase =
  | 'discovering'
  | 'reviewing'
  | 'adapting'
  | 'validating'
  | 'waiting-for-idle'
  | 'applying'
  | 'completed'
  | 'failed'
  | 'rolled-back'

/** One deterministic validation result shown in the native Settings page. */
export interface UpdateCheckResult {
  id: string
  label: string
  status: 'pending' | 'running' | 'passed' | 'failed'
  detail?: string
}

/** Deterministic repository conflict inventory produced before candidate adaptation. */
export interface CompatibilityReport {
  mergeBase: string
  localChangedFiles: number
  upstreamChangedFiles: number
  overlappingFiles: readonly string[]
  conflictFiles: readonly string[]
  impactedPlugins: readonly string[]
  riskAreas: readonly string[]
}

/** Persisted public state of one continuous-adaptation operation. */
export interface UpdateSnapshot {
  schemaVersion: 1
  phase: UpdatePhase
  jobId: string
  workerPid: number
  currentCommit: string
  upstreamCommit?: string
  candidateCommit?: string
  previousCommit?: string
  snapshotPath?: string
  startedAt: string
  updatedAt: string
  report?: CompatibilityReport
  checks: readonly UpdateCheckResult[]
  error?: string
}

/** Product state before the first continuous-adaptation operation. */
export interface IdleUpdateView {
  phase: 'idle'
  currentCommit?: string
}

/** Automatic-update state rendered by the native Settings page. */
export interface AutomaticUpdateView {
  enabled: boolean
  checking: boolean
  intervalHours: number
  lastCheckedAt?: string
  lastSeenCommit?: string
  lastError?: string
}

/**
 * Determine whether a phase still owns the single operation slot.
 * @param phase - persisted update lifecycle phase.
 * @returns true while the detached operation remains active.
 */
export function isActiveUpdatePhase(phase: UpdatePhase): boolean {
  return phase !== 'completed' && phase !== 'failed' && phase !== 'rolled-back'
}

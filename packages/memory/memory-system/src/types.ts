/** Runtime-neutral values shared by the Host and browser halves. */

export type MemoryDocumentKind = 'user' | 'ai'
export type MemoryWriteReason = 'user-edit' | 'selection-memory' | 'auto-maintenance' | 'restore'

export interface MemoryDocumentView {
  readonly kind: MemoryDocumentKind
  readonly path: string
  readonly exists: boolean
  readonly content: string
  readonly revision: string
  readonly updatedAt?: string
  readonly canRestore: boolean
}

export interface MemoryMaintenanceFailure {
  /** Instant of the failed attempt as an ISO timestamp. */
  readonly at: string
  readonly message: string
}

export interface MemoryState {
  /** Time cursor above which recorded conversation evidence still awaits AI-memory curation. */
  readonly lastMaintenanceCursor: number
  readonly lastMaintenanceAt?: string
  readonly lastMaintenanceError?: MemoryMaintenanceFailure
  readonly lastProvider?: string
  readonly lastModel?: string
}

/** Result of one explicit or quiet-scheduled AI-memory maintenance pass. */
export interface MaintenanceOutcome {
  readonly status: 'completed' | 'empty' | 'busy' | 'failed'
  readonly changed?: boolean
  readonly summary?: string
  readonly revision?: string
  /** Present only with `status: 'failed'`: why this pass committed nothing. */
  readonly message?: string
}

export interface SelectionMemorySource {
  readonly selectedText: string
  readonly context: string
  readonly sessionId: string
  readonly cwd?: string
  readonly sourceType: 'dsh' | 'browser'
  readonly pageTitle?: string
  readonly url?: string
  readonly element?: string
}

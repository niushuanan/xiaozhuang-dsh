/** Runtime-neutral values shared by the Host and browser halves. */

export type MemoryDocumentKind = 'user' | 'ai'
export type MemoryWriteReason = 'user-edit' | 'selection-memory' | 'daily-maintenance' | 'restore'

export interface MemoryDocumentView {
  readonly kind: MemoryDocumentKind
  readonly path: string
  readonly exists: boolean
  readonly content: string
  readonly revision: string
  readonly updatedAt?: string
  readonly canRestore: boolean
}
export interface MemoryState {
  readonly lastDailyCursor: number
  readonly lastMaintenanceAt?: string
  readonly lastProvider?: string
  readonly lastModel?: string
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

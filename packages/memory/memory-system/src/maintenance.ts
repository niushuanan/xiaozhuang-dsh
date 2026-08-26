/** Conversation scanning and transactional living-document maintenance. */

import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { redactSensitiveText } from './domain.ts'
import {
  buildMemoryModelRequest,
  type ConversationMemoryEvidence,
  type MemoryModelResult,
  type MemoryModelSource,
  type MemoryRoute,
} from './model.ts'
import type { MemoryDocumentKind, MemoryDocumentStore } from './store.ts'

type MemoryQuery = Pick<SessionQueryEngine, 'listSessions' | 'filterEvents'>

/** Split one cursor window's conversation evidence into model-sized batches without dropping conversations. */
export function batchConversationEvidence(
  evidence: readonly ConversationMemoryEvidence[],
  maxCharacters = 120_000,
): ConversationMemoryEvidence[][] {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters <= 0) throw new Error('maxCharacters must be positive')
  const batches: ConversationMemoryEvidence[][] = []
  let batch: ConversationMemoryEvidence[] = []
  let size = 0
  for (const item of evidence) {
    const itemSize = item.text.length + item.sessionId.length + (item.cwd?.length ?? 0) + 128
    if (batch.length > 0 && size + itemSize > maxCharacters) {
      batches.push(batch)
      batch = []
      size = 0
    }
    batch.push(item)
    size += itemSize
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

/** Read only current user/assistant semantic events in the exact successful-cursor window. */
export async function collectConversationChanges(
  sessionQuery: MemoryQuery,
  afterCursor: number,
  throughCursor: number,
  signal?: AbortSignal,
): Promise<ConversationMemoryEvidence[]> {
  const records = await sessionQuery.listSessions(signal)
  const batches: ConversationMemoryEvidence[][] = []
  for (const record of records) {
    signal?.throwIfAborted()
    const events = await sessionQuery.filterEvents(record.header.id, [
      { kind: 'time', from: afterCursor + 1, to: throughCursor },
      { kind: 'type', values: ['user/message', 'assistant/message'] },
      { kind: 'surface', values: ['current'] },
    ])
    const evidence = events.map((event): ConversationMemoryEvidence => ({
      sessionId: event.sessionId,
      ...record.header.cwd === undefined ? {} : { cwd: record.header.cwd },
      seq: event.seq,
      time: event.time,
      role: event.type === 'user/message' ? 'user' : 'assistant',
      text: redactSensitiveText(event.text),
    }))
    batches.push(evidence)
    await new Promise<void>((resolve) => { setImmediate(resolve) })
  }
  return batches.flat().sort((left, right) => left.time - right.time
    || left.sessionId.localeCompare(right.sessionId)
    || left.seq - right.seq)
}

export interface MaintainMemoryRequest {
  readonly store: Pick<MemoryDocumentStore, 'read' | 'write'>
  readonly kind: MemoryDocumentKind
  readonly source: MemoryModelSource
  readonly route: MemoryRoute
  readonly sessionId?: SessionId
  readonly signal?: AbortSignal
  readonly generate: (input: {
    readonly request: ReturnType<typeof buildMemoryModelRequest>
    readonly route: MemoryRoute
    readonly sessionId?: SessionId
    readonly signal?: AbortSignal
  }) => Promise<MemoryModelResult>
}

/** Curate a complete replacement and commit it only when it differs from the loaded revision. */
export async function maintainMemoryDocument(request: MaintainMemoryRequest): Promise<{
  readonly summary: string
  readonly changed: boolean
  readonly revision: string
}> {
  const current = await request.store.read(request.kind)
  const result = await request.generate({
    request: buildMemoryModelRequest({
      kind: request.kind,
      currentDocument: current.content,
      source: request.source,
    }),
    route: request.route,
    ...request.sessionId === undefined ? {} : { sessionId: request.sessionId },
    ...request.signal === undefined ? {} : { signal: request.signal },
  })
  if (result.document === current.content) {
    return { summary: result.summary, changed: false, revision: current.revision }
  }
  const reason = request.kind === 'user' ? 'selection-memory' : 'auto-maintenance'
  const saved = await request.store.write(request.kind, result.document, current.revision, reason)
  return { summary: result.summary, changed: true, revision: saved.revision }
}

/** Conversation scanning and transactional living-document maintenance. */

import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
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

type MemoryQuery = Pick<SessionQueryEngine, 'listSessions' | 'readSurface'>

const MAX_EVIDENCE_TEXT_CHARACTERS = 12_000
const MAX_EVIDENCE_BATCH_CHARACTERS = 60_000
const OMITTED_MIDDLE = '\n\n… [middle omitted for memory maintenance] …\n\n'

export function boundedEvidenceText(
  text: string,
  maxCharacters = MAX_EVIDENCE_TEXT_CHARACTERS,
): string {
  if (text.length <= maxCharacters) return text
  const available = maxCharacters - OMITTED_MIDDLE.length
  const head = Math.ceil(available / 2)
  const tail = Math.floor(available / 2)
  return `${text.slice(0, head)}${OMITTED_MIDDLE}${text.slice(-tail)}`
}

/** Keep only user-visible prose; tool calls, results, and reasoning are execution trace, not conversation memory. */
function visibleConversationText(
  event: SessionEvent<'user/message'> | SessionEvent<'assistant/message'>,
): string {
  const content = event.type === 'user/message' ? event.data.content : event.data.message.content
  return content
    .flatMap(block => block.type === 'text' ? [block.text.trim()] : [])
    .filter(Boolean)
    .join('\n')
}

/** Split one cursor window's conversation evidence into model-sized batches without dropping conversations. */
export function batchConversationEvidence(
  evidence: readonly ConversationMemoryEvidence[],
  maxCharacters = MAX_EVIDENCE_BATCH_CHARACTERS,
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

/** Read only real user/model conversation events in the exact successful-cursor window. */
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
    const surface = await sessionQuery.readSurface(record.header.id)
    const evidence: ConversationMemoryEvidence[] = []
    for (const event of surface.events) {
      if (event.time <= afterCursor || event.time > throughCursor) continue
      let role: ConversationMemoryEvidence['role']
      switch (event.type) {
        case 'user/message':
          if (event.data.source.kind !== 'user') continue
          role = 'user'
          break
        case 'assistant/message':
          role = 'assistant'
          break
        default:
          continue
      }
      const text = boundedEvidenceText(redactSensitiveText(visibleConversationText(event)))
      if (text.trim() === '') continue
      evidence.push({
        sessionId: record.header.id,
        ...record.header.cwd === undefined ? {} : { cwd: record.header.cwd },
        seq: event.seq,
        time: event.time,
        role,
        text,
      })
    }
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

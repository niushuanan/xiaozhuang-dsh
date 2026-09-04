/** Browser transport for the fixed global memory documents and selection action. */

import type {
  MaintenanceOutcome, MemoryDocumentKind, MemoryDocumentView, MemoryState, SelectionMemorySource,
} from '../types.ts'

const API = '/plugins/memory-system/api'

export interface MemoryDocumentsResponse {
  readonly user: MemoryDocumentView
  readonly ai: MemoryDocumentView
  readonly state: MemoryState
}

export class MemoryRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: unknown }
  if (!response.ok) {
    throw new MemoryRequestError(response.status, typeof body.error === 'string' ? body.error : `HTTP ${String(response.status)}`)
  }
  return body
}

export async function loadMemoryDocuments(signal?: AbortSignal): Promise<MemoryDocumentsResponse> {
  return jsonResponse(await fetch(`${API}/documents`, signal === undefined ? undefined : { signal }))
}

export async function saveMemoryDocument(
  kind: MemoryDocumentKind,
  content: string,
  revision: string,
): Promise<MemoryDocumentView> {
  return jsonResponse(await fetch(`${API}/documents/${kind}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, revision }),
  }))
}

export async function restoreMemoryDocument(
  kind: MemoryDocumentKind,
  revision: string,
): Promise<MemoryDocumentView> {
  return jsonResponse(await fetch(`${API}/documents/${kind}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision }),
  }))
}

export async function rememberSelection(source: SelectionMemorySource): Promise<{
  readonly summary: string
  readonly changed: boolean
  readonly revision: string
}> {
  return jsonResponse(await fetch(`${API}/remember`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  }))
}

/** Ask the Host for one immediate AI-memory pass that includes brand-new messages.
 *
 * @returns The pass outcome as the Host scheduler reports it.
 */
export async function organizeAiMemory(): Promise<MaintenanceOutcome> {
  return jsonResponse(await fetch(`${API}/maintain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }))
}

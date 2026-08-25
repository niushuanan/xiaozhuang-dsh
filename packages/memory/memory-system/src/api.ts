/** Loopback-only HTTP boundary for the memory settings and selection plugins. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { isTrustedApiRequest } from '@deepseek-ai/dsh-client-connection'
import { MemoryStoreError } from './store.ts'
import type {
  MemoryDocumentKind, MemoryDocumentView, MemoryState, SelectionMemorySource,
} from './types.ts'

export const MEMORY_API_ROUTE = '/plugins/memory-system/api'
const MAX_BODY_BYTES = 2 * 1024 * 1024 + 16 * 1024
const MAX_SELECTION_CHARACTERS = 32_000
const MAX_CONTEXT_CHARACTERS = 160_000

export interface MemoryApiService {
  documents(): Promise<{ user: MemoryDocumentView; ai: MemoryDocumentView; state: MemoryState }>
  write(kind: MemoryDocumentKind, content: string, revision: string): Promise<MemoryDocumentView>
  restore(kind: MemoryDocumentKind, revision: string): Promise<MemoryDocumentView>
  remember(source: SelectionMemorySource, signal?: AbortSignal): Promise<{
    readonly summary: string
    readonly changed: boolean
    readonly revision: string
  }>
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function requireJsonRequest(req: IncomingMessage): void {
  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new ApiError(415, 'application/json required')
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Uint8Array[] = []
  for await (const chunk of req as AsyncIterable<unknown>) {
    if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string') throw new ApiError(400, 'invalid request body')
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new ApiError(413, 'request body is too large')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new ApiError(400, 'invalid JSON')
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ApiError(400, 'JSON object required')
  return value as Record<string, unknown>
}

function documentKind(value: string): MemoryDocumentKind | undefined {
  return value === 'user' || value === 'ai' ? value : undefined
}

function editBody(value: unknown): { content: string; revision: string } {
  const body = record(value)
  if (typeof body.content !== 'string') throw new ApiError(400, 'content must be a string')
  if (Buffer.byteLength(body.content, 'utf8') > 2 * 1024 * 1024) throw new ApiError(413, 'memory document is too large')
  if (typeof body.revision !== 'string' || body.revision === '') throw new ApiError(400, 'revision is required')
  return { content: body.content, revision: body.revision }
}

function selectionBody(value: unknown): SelectionMemorySource {
  const body = record(value)
  if (typeof body.selectedText !== 'string' || body.selectedText.trim() === '') {
    throw new ApiError(400, 'selectedText is required')
  }
  if (body.selectedText.length > MAX_SELECTION_CHARACTERS) throw new ApiError(413, 'selected text is too large')
  if (typeof body.context !== 'string' || body.context.length > MAX_CONTEXT_CHARACTERS) {
    throw new ApiError(body.context === undefined ? 400 : 413, 'selection context is invalid or too large')
  }
  if (typeof body.sessionId !== 'string' || body.sessionId === '') throw new ApiError(400, 'sessionId is required')
  if (body.sourceType !== 'dsh' && body.sourceType !== 'browser') throw new ApiError(400, 'sourceType is invalid')
  const optional: Record<string, string> = {}
  for (const field of ['cwd', 'pageTitle', 'url', 'element'] as const) {
    const fieldValue = body[field]
    if (fieldValue !== undefined && typeof fieldValue !== 'string') throw new ApiError(400, `${field} must be a string`)
    if (typeof fieldValue === 'string') optional[field] = fieldValue.slice(0, 8_000)
  }
  return {
    selectedText: body.selectedText,
    context: body.context,
    sessionId: body.sessionId,
    sourceType: body.sourceType,
    ...optional,
  }
}

/** Route fixed document operations and one bounded model-backed memory action. */
export async function memoryApiHandler(
  req: IncomingMessage,
  res: ServerResponse,
  service: MemoryApiService,
): Promise<void> {
  if (!isTrustedApiRequest(req, [])) {
    sendJson(res, 403, { error: 'memory is available only on this computer' })
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const suffix = url.pathname.slice(MEMORY_API_ROUTE.length)
  try {
    if (req.method === 'PUT' || req.method === 'POST') requireJsonRequest(req)
    if (req.method === 'GET' && suffix === '/documents') {
      sendJson(res, 200, await service.documents())
      return
    }
    const document = suffix.match(/^\/documents\/([^/]+)$/u)
    if (req.method === 'PUT' && document !== null) {
      const kind = documentKind(document[1] as string)
      if (kind === undefined) throw new ApiError(404, 'unknown memory document')
      const body = editBody(await readJson(req))
      sendJson(res, 200, await service.write(kind, body.content, body.revision))
      return
    }
    const restore = suffix.match(/^\/documents\/([^/]+)\/restore$/u)
    if (req.method === 'POST' && restore !== null) {
      const kind = documentKind(restore[1] as string)
      if (kind === undefined) throw new ApiError(404, 'unknown memory document')
      const body = record(await readJson(req))
      if (typeof body.revision !== 'string' || body.revision === '') throw new ApiError(400, 'revision is required')
      sendJson(res, 200, await service.restore(kind, body.revision))
      return
    }
    if (req.method === 'POST' && suffix === '/remember') {
      sendJson(res, 200, await service.remember(selectionBody(await readJson(req))))
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    const status = error instanceof ApiError || error instanceof MemoryStoreError ? error.status : 500
    sendJson(res, status, { error: error instanceof Error ? error.message : String(error) })
  }
}

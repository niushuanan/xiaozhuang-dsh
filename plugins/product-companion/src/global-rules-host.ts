/** Host-only editor for the user-global AGENTS.md used by every DSH session. */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { dshHomeDisplay, resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Same-origin API removed together with the native companion plugin. */
export const GLOBAL_RULES_API_ROUTE = '/plugins/ui-product-companion/api/global-rules'

const GLOBAL_RULES_FILE = 'AGENTS.md'
const MAX_RULES_BYTES = 1_048_576
const MISSING_REVISION = 'missing'

export interface GlobalRulesView {
  path: string
  displayPath: string
  exists: boolean
  content: string
  revision: string
}

interface GlobalRulesWriteRequest {
  content: string
  revision: string
}

class GlobalRulesError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const authority = req.headers.host ?? ''
  const host = authority.startsWith('[')
    ? authority.slice(1, authority.indexOf(']'))
    : authority.split(':')[0] ?? ''
  return host === 'localhost' || host === '::1' || host.startsWith('127.')
}

function globalRulesLocation(dshHome = resolveDshHome()): { home: string; path: string; displayPath: string } {
  return {
    home: dshHome,
    path: join(dshHome, GLOBAL_RULES_FILE),
    displayPath: `${dshHomeDisplay(dshHome)}/${GLOBAL_RULES_FILE}`,
  }
}

function revisionOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Uint8Array[] = []
  for await (const chunk of req as AsyncIterable<unknown>) {
    if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string') {
      throw new GlobalRulesError(400, 'invalid request body')
    }
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buffer.byteLength
    if (size > MAX_RULES_BYTES + 8_192) throw new GlobalRulesError(413, 'global rules are too large')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new GlobalRulesError(400, 'invalid JSON')
  }
}

function writeRequest(value: unknown): GlobalRulesWriteRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GlobalRulesError(400, 'invalid global rules request')
  }
  const body = value as Record<string, unknown>
  if (typeof body.content !== 'string' || Buffer.byteLength(body.content, 'utf8') > MAX_RULES_BYTES) {
    throw new GlobalRulesError(413, 'global rules are too large')
  }
  if (typeof body.revision !== 'string'
    || (body.revision !== MISSING_REVISION && !/^[a-f0-9]{64}$/u.test(body.revision))) {
    throw new GlobalRulesError(400, 'invalid global rules revision')
  }
  return { content: body.content, revision: body.revision }
}

async function readGlobalRules(dshHome?: string): Promise<GlobalRulesView> {
  const location = globalRulesLocation(dshHome)
  const info = await stat(location.path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (info === undefined) {
    return {
      path: location.path,
      displayPath: location.displayPath,
      exists: false,
      content: '',
      revision: MISSING_REVISION,
    }
  }
  if (!info.isFile() || info.size > MAX_RULES_BYTES) {
    throw new GlobalRulesError(info.size > MAX_RULES_BYTES ? 413 : 400, 'AGENTS.md is not an editable text file')
  }
  const content = await readFile(location.path, 'utf8')
  return {
    path: location.path,
    displayPath: location.displayPath,
    exists: true,
    content,
    revision: revisionOf(content),
  }
}

async function writeGlobalRules(body: GlobalRulesWriteRequest, dshHome?: string): Promise<GlobalRulesView> {
  const current = await readGlobalRules(dshHome)
  if (current.revision !== body.revision) {
    throw new GlobalRulesError(409, 'AGENTS.md changed outside this editor; load the latest content before saving')
  }
  const location = globalRulesLocation(dshHome)
  await mkdir(location.home, { recursive: true })
  const temporary = join(location.home, `.AGENTS.md.dsh-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, body.content, { encoding: 'utf8', flag: 'wx', mode: 0o644 })
    await rename(temporary, location.path)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
  return {
    path: location.path,
    displayPath: location.displayPath,
    exists: true,
    content: body.content,
    revision: revisionOf(body.content),
  }
}

/** Read and update only the fixed user-global AGENTS.md on loopback. */
export async function globalRulesApiHandler(
  req: IncomingMessage,
  res: ServerResponse,
  dshHome?: string,
): Promise<void> {
  if (!isLoopbackRequest(req)) {
    sendJson(res, 403, { error: 'global rules are available only on this computer' })
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== GLOBAL_RULES_API_ROUTE) {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, await readGlobalRules(dshHome))
      return
    }
    if (req.method === 'PUT' && (req.headers['content-type'] ?? '').startsWith('application/json')) {
      sendJson(res, 200, await writeGlobalRules(writeRequest(await readJson(req)), dshHome))
      return
    }
    sendJson(res, 405, { error: 'GET or JSON PUT required' })
  } catch (error) {
    const status = error instanceof GlobalRulesError ? error.status : 500
    const message = error instanceof Error ? error.message : String(error)
    sendJson(res, status, { error: message })
  }
}

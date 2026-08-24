/** Host-only editor for the active project's AGENTS.md, owned by the companion plugin. */

import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, join } from 'node:path'

/** Same-origin API removed together with the native companion plugin. */
export const PROJECT_RULES_API_ROUTE = '/plugins/ui-product-companion/api/project-rules'

const PROJECT_RULES_FILE = 'AGENTS.md'
const MAX_PROJECT_PATH_CHARS = 4_096
const MAX_RULES_BYTES = 512 * 1024
const MISSING_REVISION = 'missing'

export interface ProjectRulesView {
  cwd: string
  path: string
  exists: boolean
  content: string
  revision: string
}

interface ProjectRulesWriteRequest {
  cwd: string
  content: string
  revision: string
}

class ProjectRulesError extends Error {
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

function projectDirectory(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PROJECT_PATH_CHARS || !isAbsolute(value)) {
    throw new ProjectRulesError(400, 'invalid project directory')
  }
  return value
}

function revisionOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Uint8Array[] = []
  for await (const chunk of req as AsyncIterable<unknown>) {
    if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string') {
      throw new ProjectRulesError(400, 'invalid request body')
    }
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buffer.byteLength
    if (size > MAX_RULES_BYTES + MAX_PROJECT_PATH_CHARS + 8_192) {
      throw new ProjectRulesError(413, 'project rules are too large')
    }
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new ProjectRulesError(400, 'invalid JSON')
  }
}

function writeRequest(value: unknown): ProjectRulesWriteRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProjectRulesError(400, 'invalid project rules request')
  }
  const body = value as Record<string, unknown>
  const cwd = projectDirectory(body.cwd)
  if (typeof body.content !== 'string' || Buffer.byteLength(body.content, 'utf8') > MAX_RULES_BYTES) {
    throw new ProjectRulesError(413, 'project rules are too large')
  }
  if (typeof body.revision !== 'string'
    || (body.revision !== MISSING_REVISION && !/^[a-f0-9]{64}$/u.test(body.revision))) {
    throw new ProjectRulesError(400, 'invalid project rules revision')
  }
  return { cwd, content: body.content, revision: body.revision }
}

async function readProjectRules(cwd: string): Promise<ProjectRulesView> {
  const directory = await stat(cwd).catch((error: unknown) => {
    throw new ProjectRulesError(400, `project directory is unavailable: ${String(error)}`)
  })
  if (!directory.isDirectory()) throw new ProjectRulesError(400, 'project path is not a directory')
  const path = join(cwd, PROJECT_RULES_FILE)
  const info = await stat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (info === undefined) {
    return { cwd, path, exists: false, content: '', revision: MISSING_REVISION }
  }
  if (!info.isFile() || info.size > MAX_RULES_BYTES) {
    throw new ProjectRulesError(info.size > MAX_RULES_BYTES ? 413 : 400, 'AGENTS.md is not an editable text file')
  }
  const content = await readFile(path, 'utf8')
  return { cwd, path, exists: true, content, revision: revisionOf(content) }
}

async function writeProjectRules(body: ProjectRulesWriteRequest): Promise<ProjectRulesView> {
  const current = await readProjectRules(body.cwd)
  if (current.revision !== body.revision) {
    throw new ProjectRulesError(409, 'AGENTS.md changed outside this editor; reload before saving')
  }
  const path = join(body.cwd, PROJECT_RULES_FILE)
  const temporary = join(body.cwd, `.AGENTS.md.dsh-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, body.content, { encoding: 'utf8', flag: 'wx', mode: 0o644 })
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
  return {
    cwd: body.cwd,
    path,
    exists: true,
    content: body.content,
    revision: revisionOf(body.content),
  }
}

/** Read, create, and update only the fixed AGENTS.md at a loopback project's root. */
export async function projectRulesApiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isLoopbackRequest(req)) {
    sendJson(res, 403, { error: 'project rules are available only on this computer' })
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== PROJECT_RULES_API_ROUTE) {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, await readProjectRules(projectDirectory(url.searchParams.get('cwd'))))
      return
    }
    if (req.method === 'PUT' && (req.headers['content-type'] ?? '').startsWith('application/json')) {
      sendJson(res, 200, await writeProjectRules(writeRequest(await readJson(req))))
      return
    }
    sendJson(res, 405, { error: 'GET or JSON PUT required' })
  } catch (error) {
    const status = error instanceof ProjectRulesError ? error.status : 500
    const message = error instanceof Error ? error.message : String(error)
    sendJson(res, status, { error: message })
  }
}

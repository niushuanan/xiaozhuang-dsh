/** Native Host half of Skill Settings, inspection, and personal import. */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { listManagedSkills, readManagedSkill } from './catalog.ts'
import {
  buildNormalizationRequest,
  inspectStagedFiles,
  installNormalizedSkill,
  stageUpload,
  validateGitHubRepositoryUrl,
  validateRelativePath,
  type NormalizedSkill,
} from './import.ts'
import { generateNormalizedSkill } from './model.ts'
import type { SkillImportRequest, SkillInstallResult, UploadedSkillFile } from './types.ts'

export const name = 'ui-skill-manager'
export const inject = ['webServer', 'skills', 'llm', 'sessions', 'agents', 'agentPresets']
/** Loopback HTTP prefix owned by the Skill manager. */
export const ROUTE_PATH = '/plugins/skill-manager/api'

const execFileAsync = promisify(execFile)
const MAX_REQUEST_BYTES = 34 * 1024 * 1024

/** Host configuration for workspace discovery and personal installation. */
export interface Config {
  /** Workspace used for project-sensitive Skill discovery. */
  readonly cwd?: string
  /** DSH home whose personal `skills` directory receives imports. */
  readonly dshHome?: string
}

type RequestHeaders = Readonly<Record<string, string | readonly string[] | undefined>>

/**
 * Return whether a request came from a loopback, same-origin browser surface.
 * @param request - request headers used for loopback and Fetch Metadata checks.
 * @returns whether the Skill API may serve the request.
 */
export function isLoopbackRequest(request: { readonly headers: RequestHeaders }): boolean {
  const authority = typeof request.headers.host === 'string' ? request.headers.host : ''
  const host = authority.startsWith('[') ? authority.slice(1, authority.indexOf(']')) : authority.split(':')[0] ?? ''
  const site = request.headers['sec-fetch-site']
  return (host === 'localhost' || host === '::1' || host.startsWith('127.'))
    && (site === undefined || site === 'same-origin' || site === 'none')
}

function uploadedFile(value: unknown): UploadedSkillFile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('导入文件格式无效')
  const record = value as Record<string, unknown>
  if (typeof record.path !== 'string' || typeof record.contentBase64 !== 'string') throw new Error('导入文件格式无效')
  validateRelativePath(record.path)
  if (record.mimeType !== undefined && typeof record.mimeType !== 'string') throw new Error('导入文件类型无效')
  return {
    path: record.path,
    contentBase64: record.contentBase64,
    ...record.mimeType === undefined ? {} : { mimeType: record.mimeType },
  }
}

/**
 * Validate the JSON union accepted by the import endpoint.
 * @param value - parsed untrusted request body.
 * @returns validated file or GitHub import request.
 */
export function parseSkillImportRequest(value: unknown): SkillImportRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('导入请求格式无效')
  const record = value as Record<string, unknown>
  if (record.kind === 'github') {
    if (typeof record.url !== 'string') throw new Error('GitHub 仓库地址无效')
    return { kind: 'github', url: record.url }
  }
  if (record.kind === 'files') {
    if (!Array.isArray(record.files)) throw new Error('导入文件格式无效')
    return { kind: 'files', files: record.files.map(uploadedFile) }
  }
  throw new Error('导入来源无效')
}

interface SkillReader {
  readonly list: (options?: { readonly cwd?: string; readonly scope?: ScopeKey }) => Promise<readonly SkillSummary[]>
  readonly get: (name: string, options?: { readonly cwd?: string; readonly scope?: ScopeKey }) => Promise<SkillDefinition | undefined>
}

/** Session-addressed Skill view shared with the composer's catalog semantics. */
export interface SessionSkillView {
  readonly skills: SkillReader
  readonly cwd: string
  readonly scope?: ScopeKey
}

/**
 * Resolve the exact live Session registry and project root used for Skill invocation.
 * @param ctx - Host services containing Sessions, Agents, presets, and the global fallback registry.
 * @param fallbackCwd - project root used when no Session is selected or a legacy header has no cwd.
 * @param rawSessionId - optional browser-selected Session identity.
 * @returns registry, cwd, and scope for list/get/import conflict reads.
 */
export function resolveSessionSkillView(ctx: Context, fallbackCwd: string, rawSessionId?: string): SessionSkillView {
  if (rawSessionId === undefined || rawSessionId === '') return { skills: ctx.skills, cwd: fallbackCwd }
  const sessionId = rawSessionId as SessionId
  const session = ctx.sessions.get(sessionId)
  // The client Session list includes durable historical rows, while the Host
  // registry only contains resident Sessions. Plain Chat deliberately points
  // Skill management at the latest work row; after switching away that row
  // may already be detached. Personal and bundled Skills must remain usable,
  // so degrade to the global registry instead of turning the whole page into
  // a stale-session error.
  if (session === undefined) return { skills: ctx.skills, cwd: fallbackCwd }
  const live = ctx.agents.get(sessionId)
  const scoped = live === undefined ? undefined : ctx.agentPresets.serviceFor(live, 'skills')
  return {
    skills: scoped ?? ctx.skills,
    cwd: session.header.cwd ?? fallbackCwd,
    ...live === undefined ? {} : { scope: live },
  }
}

type Normalize = (request: { readonly system: string; readonly input: string }) => Promise<NormalizedSkill>

async function cloneGitHubRepository(url: string, destination: string): Promise<void> {
  const repository = validateGitHubRepositoryUrl(url)
  await execFileAsync('git', ['clone', '--depth', '1', '--single-branch', '--no-tags', '--', repository, destination], {
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  })
}

/**
 * Stage, normalize, conflict-adapt, validate, and atomically install one personal Skill.
 * @param options - import source, roots, current registry, and fixed model caller.
 * @returns installed personal Skill name and replacement status.
 */
export async function importPersonalSkill(options: {
  readonly request: SkillImportRequest
  readonly dshHome: string
  readonly cwd: string
  readonly scope?: ScopeKey
  readonly skills: SkillReader
  readonly normalize: Normalize
}): Promise<SkillInstallResult> {
  const temporaryRoot = resolve(options.dshHome, 'tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const operation = await mkdtemp(join(temporaryRoot, 'skill-import-'))
  const stagedRoot = join(operation, 'source')
  try {
    if (options.request.kind === 'files') await stageUpload(stagedRoot, options.request.files)
    else await cloneGitHubRepository(options.request.url, stagedRoot)
    const files = await inspectStagedFiles(stagedRoot)
    let normalized = await options.normalize(buildNormalizationRequest({ files }))
    const lookup = { cwd: options.cwd, ...options.scope === undefined ? {} : { scope: options.scope } }
    const sameName = (await options.skills.list(lookup)).find(skill => skill.name === normalized.name)
    if (sameName !== undefined) {
      const existing = await options.skills.get(sameName.name, lookup)
      if (existing !== undefined) {
        normalized = await options.normalize(buildNormalizationRequest({
          files,
          conflict: { name: existing.name, description: existing.description, content: existing.content },
        }))
      }
    }
    const result = await installNormalizedSkill({
      personalSkillsRoot: join(resolve(options.dshHome), 'skills'),
      stagedRoot,
      normalized,
    })
    return { installed: result.name, replaced: result.replaced }
  } finally {
    await rm(operation, { recursive: true, force: true })
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    size += chunk.byteLength
    if (size > MAX_REQUEST_BYTES) throw new Error('导入请求过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) throw new Error('导入请求为空')
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

/**
 * Build the package-owned loopback HTTP handler.
 * @param ctx - Host context providing Web, Skill, and LLM services.
 * @param config - workspace and DSH Home overrides.
 * @returns request handler for the package route prefix.
 */
export function createSkillManagerHandler(
  ctx: Context,
  config: Config = {},
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const cwd = resolve(config.cwd ?? process.cwd())
  const dshHome = resolveDshHome(config.dshHome)
  return async (request, response) => {
    if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Skill 只能在本机管理' })
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    try {
      if (url.pathname.endsWith('/skills')) {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'method not allowed' })
        const view = resolveSessionSkillView(ctx, cwd, url.searchParams.get('sessionId') ?? undefined)
        return sendJson(response, 200, { skills: await listManagedSkills(view.skills, view.cwd, view.scope) })
      }
      if (url.pathname.endsWith('/skill')) {
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'method not allowed' })
        const skillName = url.searchParams.get('name')
        if (skillName === null) return sendJson(response, 400, { error: 'Skill 名称无效' })
        const view = resolveSessionSkillView(ctx, cwd, url.searchParams.get('sessionId') ?? undefined)
        return sendJson(response, 200, await readManagedSkill(view.skills, view.cwd, skillName, view.scope))
      }
      if (!url.pathname.endsWith('/import')) return sendJson(response, 404, { error: 'not found' })
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'method not allowed' })
      let importRequest: SkillImportRequest
      try { importRequest = parseSkillImportRequest(await readJson(request)) } catch (error) {
        return sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
      }
      const view = resolveSessionSkillView(ctx, cwd, url.searchParams.get('sessionId') ?? undefined)
      const result = await importPersonalSkill({
        request: importRequest,
        dshHome,
        cwd: view.cwd,
        ...view.scope === undefined ? {} : { scope: view.scope },
        skills: view.skills,
        normalize: request => generateNormalizedSkill(ctx, request),
      })
      return sendJson(response, 200, result)
    } catch (error) {
      return sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Register the loopback Skill API under the Host Web server. */
export function apply(ctx: Context, config: Config = {}): void {
  const handler = createSkillManagerHandler(ctx, config)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PATH,
    handler: (request, response) => { void handler(request, response) },
  }), 'ui-skill-manager: loopback Skill API')
}

/** Native Host half of Xiaozhuang plugin management and selective export. */

import { execFile } from 'node:child_process'
import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { PLUGIN_EXPORT_CATALOG, PLUGIN_ROWS } from './catalog.ts'
import { buildPluginExport } from './export.ts'

export const name = 'ui-plugin-catalog'
export const inject = ['loader', 'webServer']
export const ROUTE_PATH = '/plugins/xiaozhuang-plugins/api'
export const CODEX_ICON_PATH = new URL('../assets/codex.png', import.meta.url)
export const ZCODE_ICON_PATH = new URL('../assets/zcode.png', import.meta.url)
export const SWITCH_BLOCK_START = '# xiaozhuang-plugin-switches:start'
export const SWITCH_BLOCK_END = '# xiaozhuang-plugin-switches:end'

export interface Config {
  /** Source checkout used by repository-native plugin exports. */
  readonly repositoryRoot?: string
  /** Web Profile patch used by live plugin switches. */
  readonly patchPath?: string
  /** Out-of-tree package root used by profile plugin exports. */
  readonly profilePackagesRoot?: string
}

interface LoaderEntry {
  readonly options?: { readonly id?: string }
  readonly disabled?: boolean
  readonly fiber?: { readonly state?: number }
}

interface ExternalConfig {
  codex: { model: string; reasoningEffort: string }
  zcode: { providerId: string; modelId: string; reasoningEffort: string }
}

interface SwitchRow {
  disabled: boolean | undefined
  config: Record<string, unknown>
}

const execFileAsync = promisify(execFile)
const ACTIVE_FIBER_STATE = 2
const MAX_BODY_BYTES = 16 * 1024
const SETTLE_TIMEOUT_MS = 8_000
const POLL_INTERVAL_MS = 80
const LEGACY_TOGGLE_TARGETS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'plain-chat': ['chat-mode'],
  'chat-migration': ['chat-mode', 'conversation-import'],
})
const DEFAULT_EXTERNAL_CONFIG: ExternalConfig = {
  codex: { model: 'gpt-5.6-sol', reasoningEffort: 'low' },
  zcode: { providerId: 'builtin:zai', modelId: 'GLM-5.3', reasoningEffort: 'max' },
}

function entriesById(loader: Context['loader']): Map<string, LoaderEntry> {
  const entries = new Map<string, LoaderEntry>()
  for (const entry of loader.entries()) {
    if (typeof entry.options?.id === 'string') entries.set(entry.options.id, entry)
  }
  return entries
}

/** Project the current Loader state for every user-facing catalog capability. */
export function snapshot(loader: Context['loader']): { plugins: readonly object[]; updatedAt: string } {
  const entries = entriesById(loader)
  const plugins = Object.entries(PLUGIN_ROWS).map(([id, rowIds]) => {
    const rows = rowIds.map(rowId => entries.get(rowId))
    const missing = rowIds.filter((_, index) => rows[index] === undefined)
    const enabled = missing.length === 0 && rows.every(entry => entry?.disabled !== true && entry?.fiber?.state === ACTIVE_FIBER_STATE)
    const disabled = missing.length === 0 && rows.every(entry => entry?.disabled === true)
    const failed = rows.some(entry => entry !== undefined && entry.disabled !== true && entry.fiber?.state === 3)
    const phase = enabled ? 'active' : disabled ? 'disabled' : failed || missing.length > 0 ? 'failed' : 'transitioning'
    return { id, enabled, phase, missing }
  })
  return { plugins, updatedAt: new Date().toISOString() }
}

function desiredReached(loader: Context['loader'], pluginId: string, enabled: boolean): boolean {
  const current = snapshot(loader).plugins.find(plugin => (plugin as { id: string }).id === pluginId) as
    { enabled: boolean; phase: string } | undefined
  return current !== undefined && current.enabled === enabled && current.phase === (enabled ? 'active' : 'disabled')
}

function yamlScalar(value: unknown): string {
  return JSON.stringify(value)
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim()
  try { return JSON.parse(trimmed) } catch { return trimmed }
}

/** Parse only the bounded switch block owned by this package. */
export function switchRowsFromBlock(source: string): Map<string, SwitchRow> {
  const start = source.indexOf(SWITCH_BLOCK_START)
  const end = source.indexOf(SWITCH_BLOCK_END)
  if (start < 0 || end < start) return new Map()
  const rows = new Map<string, SwitchRow>()
  let current: SwitchRow | undefined
  for (const line of source.slice(start + SWITCH_BLOCK_START.length, end).split('\n')) {
    const id = line.match(/^- id: (.+)$/)
    if (id?.[1] !== undefined) {
      current = { disabled: undefined, config: {} }
      rows.set(id[1], current)
      continue
    }
    if (current === undefined) continue
    const disabled = line.match(/^  disabled: (true|false)$/)
    if (disabled?.[1] !== undefined) {
      current.disabled = disabled[1] === 'true'
      continue
    }
    const config = line.match(/^    ([A-Za-z][A-Za-z0-9]*): (.+)$/)
    if (config?.[1] !== undefined && config[2] !== undefined) current.config[config[1]] = parseScalar(config[2])
  }
  return rows
}

/** Read external collaborator choices from the package-owned patch block. */
export function externalConfigFromSwitchBlock(source: string): ExternalConfig {
  const rows = switchRowsFromBlock(source)
  const codex = rows.get('subagent-codex-local')?.config ?? {}
  const zcode = rows.get('subagent-zcode-local')?.config ?? {}
  return {
    codex: {
      model: typeof codex.model === 'string' ? codex.model : DEFAULT_EXTERNAL_CONFIG.codex.model,
      reasoningEffort: typeof codex.reasoningEffort === 'string' ? codex.reasoningEffort : DEFAULT_EXTERNAL_CONFIG.codex.reasoningEffort,
    },
    zcode: {
      providerId: typeof zcode.providerId === 'string' ? zcode.providerId : DEFAULT_EXTERNAL_CONFIG.zcode.providerId,
      modelId: typeof zcode.modelId === 'string' ? zcode.modelId : DEFAULT_EXTERNAL_CONFIG.zcode.modelId,
      reasoningEffort: typeof zcode.reasoningEffort === 'string' ? zcode.reasoningEffort : DEFAULT_EXTERNAL_CONFIG.zcode.reasoningEffort,
    },
  }
}

function renderSwitchBlock(states: Record<string, boolean>, externalConfig: ExternalConfig): string {
  const lines = [SWITCH_BLOCK_START]
  for (const [pluginId, rowIds] of Object.entries(PLUGIN_ROWS)) {
    const disabled = states[pluginId] === false
    for (const rowId of rowIds) {
      lines.push(`- id: ${rowId}`, `  disabled: ${disabled}`)
      if (rowId === 'subagent-codex-local') {
        lines.push('  config:', `    model: ${yamlScalar(externalConfig.codex.model)}`, `    reasoningEffort: ${yamlScalar(externalConfig.codex.reasoningEffort)}`)
      }
      if (rowId === 'subagent-zcode-local') {
        lines.push('  config:', `    providerId: ${yamlScalar(externalConfig.zcode.providerId)}`, `    modelId: ${yamlScalar(externalConfig.zcode.modelId)}`, `    reasoningEffort: ${yamlScalar(externalConfig.zcode.reasoningEffort)}`)
      }
    }
  }
  lines.push(SWITCH_BLOCK_END)
  return lines.join('\n')
}

/** Add or replace the package-owned switch block without touching other patches. */
export function replaceSwitchBlock(
  source: string,
  states: Record<string, boolean>,
  externalConfig = externalConfigFromSwitchBlock(source),
): string {
  const block = renderSwitchBlock(states, externalConfig)
  const start = source.indexOf(SWITCH_BLOCK_START)
  const end = source.indexOf(SWITCH_BLOCK_END)
  if (start >= 0 && end >= start) return source.slice(0, start) + block + source.slice(end + SWITCH_BLOCK_END.length)
  const separator = source.length === 0 || source.endsWith('\n') ? '' : '\n'
  return `${source}${separator}\n${block}\n`
}

/** Prefer persisted intent while Loader fibers are transiently remounting. */
export function statesFromSwitchBlock(source: string, loader: Context['loader']): Record<string, boolean> {
  const fallback = Object.fromEntries(snapshot(loader).plugins.map((plugin) => {
    const value = plugin as { id: string; enabled: boolean }
    return [value.id, value.enabled]
  }))
  const rows = switchRowsFromBlock(source)
  for (const [pluginId, rowIds] of Object.entries(PLUGIN_ROWS)) {
    if (rowIds.every(rowId => rows.get(rowId)?.disabled !== undefined)) {
      fallback[pluginId] = rowIds.every(rowId => rows.get(rowId)?.disabled === false)
    }
  }
  return fallback
}

async function writePatch(filename: string, source: string, next: string): Promise<void> {
  if (next === source) return
  const info = await stat(filename)
  const temporary = `${filename}.xiaozhuang-${process.pid}.tmp`
  await writeFile(temporary, next, { mode: info.mode })
  await rename(temporary, filename)
}

function toggleTargets(id: unknown): readonly string[] | undefined {
  if (typeof id !== 'string') return undefined
  if (Object.prototype.hasOwnProperty.call(PLUGIN_ROWS, id)) return [id]
  return LEGACY_TOGGLE_TARGETS[id]
}

async function persistSwitchState(filename: string, loader: Context['loader'], pluginIds: readonly string[], enabled: boolean): Promise<void> {
  const source = await readFile(filename, 'utf8')
  const states = statesFromSwitchBlock(source, loader)
  for (const pluginId of pluginIds) states[pluginId] = enabled
  await writePatch(filename, source, replaceSwitchBlock(source, states))
}

async function persistExternalConfig(filename: string, loader: Context['loader'], id: 'codex' | 'zcode', config: ExternalConfig['codex'] | ExternalConfig['zcode']): Promise<void> {
  const source = await readFile(filename, 'utf8')
  const states = statesFromSwitchBlock(source, loader)
  const externalConfig = externalConfigFromSwitchBlock(source)
  if (id === 'codex') externalConfig.codex = config as ExternalConfig['codex']
  else externalConfig.zcode = config as ExternalConfig['zcode']
  await writePatch(filename, source, replaceSwitchBlock(source, states, externalConfig))
}

async function readJsonFile(filename: string, fallback: unknown): Promise<unknown> {
  try { return JSON.parse(await readFile(filename, 'utf8')) } catch { return fallback }
}

async function externalCatalogs(source: string): Promise<Record<string, unknown>> {
  const configured = externalConfigFromSwitchBlock(source)
  const codexCache = await readJsonFile(join(homedir(), '.codex', 'models_cache.json'), {}) as Record<string, unknown>
  const codexSource = Array.isArray(codexCache)
    ? codexCache
    : Array.isArray(codexCache.models)
      ? codexCache.models
      : Array.isArray(codexCache.data) ? codexCache.data : []
  const codexModels = codexSource.filter((model): model is Record<string, unknown> => model !== null && typeof model === 'object' && typeof (model as Record<string, unknown>).slug === 'string' && (model as Record<string, unknown>).visibility !== 'hide').map(model => ({
    id: model.slug,
    label: typeof model.display_name === 'string' ? model.display_name : model.slug,
    efforts: Array.isArray(model.supported_reasoning_levels) ? model.supported_reasoning_levels.map(level => typeof level === 'object' && level !== null ? (level as Record<string, unknown>).effort : undefined).filter((value): value is string => typeof value === 'string') : [],
    defaultEffort: typeof model.default_reasoning_level === 'string' ? model.default_reasoning_level : undefined,
  }))
  const zcodeConfig = await readJsonFile(join(homedir(), '.zcode', 'v2', 'config.json'), {}) as { provider?: Record<string, Record<string, unknown>> }
  const zcodeModels: object[] = []
  for (const [providerId, provider] of Object.entries(zcodeConfig.provider ?? {})) {
    if (provider.enabled !== true || provider.models === null || typeof provider.models !== 'object') continue
    for (const [modelId, rawModel] of Object.entries(provider.models as Record<string, unknown>)) {
      const model = rawModel !== null && typeof rawModel === 'object' ? rawModel as Record<string, unknown> : {}
      const reasoning = model.reasoning !== null && typeof model.reasoning === 'object' ? model.reasoning as Record<string, unknown> : {}
      zcodeModels.push({ providerId, modelId, id: `${providerId}/${modelId}`, label: modelId, efforts: Array.isArray(reasoning.variants) ? reasoning.variants.filter((value): value is string => typeof value === 'string') : [], defaultEffort: typeof reasoning.defaultVariant === 'string' ? reasoning.defaultVariant : undefined })
    }
  }
  return { codex: { ...configured.codex, models: codexModels }, zcode: { ...configured.zcode, models: zcodeModels } }
}

async function statusBody(loader: Context['loader'], patchPath: string): Promise<Record<string, unknown>> {
  return { ...snapshot(loader), externalAgents: await externalCatalogs(await readFile(patchPath, 'utf8')) }
}

function configuredExternalAgent(catalogs: Record<string, unknown>, id: unknown, body: Record<string, unknown>): { id: 'codex' | 'zcode'; config: ExternalConfig['codex'] | ExternalConfig['zcode'] } {
  if (id === 'codex') {
    const catalog = catalogs.codex as { models: readonly { id: string; efforts: readonly string[] }[] }
    const model = catalog.models.find(entry => entry.id === body.model)
    if (model === undefined || typeof body.reasoningEffort !== 'string' || !model.efforts.includes(body.reasoningEffort)) throw new Error('Codex 模型或思考强度无效')
    return { id, config: { model: model.id, reasoningEffort: body.reasoningEffort } }
  }
  if (id === 'zcode') {
    const catalog = catalogs.zcode as { models: readonly { providerId: string; modelId: string; efforts: readonly string[] }[] }
    const model = catalog.models.find(entry => entry.providerId === body.providerId && entry.modelId === body.modelId)
    if (model === undefined || typeof body.reasoningEffort !== 'string' || !model.efforts.includes(body.reasoningEffort)) throw new Error('Z Code 模型或思考强度无效')
    return { id, config: { providerId: model.providerId, modelId: model.modelId, reasoningEffort: body.reasoningEffort } }
  }
  throw new Error('外部智能体无效')
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('请求内容过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求格式无效')
  return value as Record<string, unknown>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function sendBrandIcon(res: ServerResponse, iconPath: URL): Promise<void> {
  const icon = await readFile(iconPath)
  res.statusCode = 200
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(icon)
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const authority = req.headers.host ?? ''
  const host = authority.startsWith('[') ? authority.slice(1, authority.indexOf(']')) : authority.split(':')[0] ?? ''
  if (host !== 'localhost' && host !== '::1' && !host.startsWith('127.')) return false
  const site = req.headers['sec-fetch-site']
  return site === undefined || site === 'same-origin' || site === 'none'
}

async function waitForState(loader: Context['loader'], pluginId: string, enabled: boolean): Promise<ReturnType<typeof snapshot>> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (desiredReached(loader, pluginId, enabled)) return snapshot(loader)
    await new Promise(resolvePromise => setTimeout(resolvePromise, POLL_INTERVAL_MS))
  }
  const current = snapshot(loader)
  const plugin = current.plugins.find(item => (item as { id: string }).id === pluginId) as { phase?: string } | undefined
  throw new Error(plugin?.phase === 'failed' ? '插件加载失败，请查看运行日志' : '插件状态切换超时，请稍后重试')
}

async function sourceCommit(repositoryRoot: string): Promise<string> {
  const result = await execFileAsync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { timeout: 30_000 })
  return result.stdout.trim()
}

function createHandler(ctx: Context, config: Config): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const loader = ctx.loader
  const dshHome = resolveDshHome()
  const repositoryRoot = resolve(config.repositoryRoot ?? process.cwd())
  const patchPath = resolve(config.patchPath ?? join(dshHome, 'profiles', 'web', 'cordis.patch.yml'))
  const profilePackagesRoot = resolve(config.profilePackagesRoot ?? join(dshHome, 'profiles', 'web', 'packages'))

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    try {
      if (url.pathname.endsWith('/assets/codex.png') || url.pathname.endsWith('/assets/codex-brand-v2.png')) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
        return sendBrandIcon(res, CODEX_ICON_PATH)
      }
      if (url.pathname.endsWith('/assets/zcode.png') || url.pathname.endsWith('/assets/zcode-brand-v2.png')) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
        return sendBrandIcon(res, ZCODE_ICON_PATH)
      }
      if (url.pathname.endsWith('/status')) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
        return sendJson(res, 200, await statusBody(loader, patchPath))
      }
      if (url.pathname.endsWith('/configure')) {
        if (req.method !== 'PUT') return sendJson(res, 405, { error: 'method not allowed' })
        const body = await readJson(req)
        const configured = configuredExternalAgent(await externalCatalogs(await readFile(patchPath, 'utf8')), body.id, body)
        await persistExternalConfig(patchPath, loader, configured.id, configured.config)
        await new Promise(resolvePromise => setTimeout(resolvePromise, 180))
        return sendJson(res, 200, await statusBody(loader, patchPath))
      }
      if (url.pathname.endsWith('/export')) {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { error: '插件只能在本机导出' })
        const body = await readJson(req)
        if (!Array.isArray(body.ids) || body.ids.some(id => typeof id !== 'string')) return sendJson(res, 400, { error: '插件选择无效' })
        const archive = await buildPluginExport({
          selectedIds: body.ids as string[],
          repositoryRoot,
          profilePackagesRoot,
          sourceCommit: await sourceCommit(repositoryRoot),
          now: new Date(),
          catalog: PLUGIN_EXPORT_CATALOG,
        })
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`)
        res.setHeader('Content-Length', String(archive.bytes.byteLength))
        res.setHeader('Cache-Control', 'no-store')
        res.end(Buffer.from(archive.bytes))
        return
      }
      if (!url.pathname.endsWith('/toggle')) return sendJson(res, 404, { error: 'not found' })
      if (req.method !== 'PUT') return sendJson(res, 405, { error: 'method not allowed' })
      const body = await readJson(req)
      const targets = toggleTargets(body.id)
      if (targets === undefined || typeof body.enabled !== 'boolean') return sendJson(res, 400, { error: '插件或开关状态无效' })
      await persistSwitchState(patchPath, loader, targets, body.enabled)
      for (const pluginId of targets) await waitForState(loader, pluginId, body.enabled)
      return sendJson(res, 200, snapshot(loader))
    } catch (error) {
      return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Register plugin controls and export under the existing same-origin route. */
export function apply(ctx: Context, config: Config = {}): void {
  const handler = createHandler(ctx, config)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PATH,
    handler: (req, res) => { void handler(req, res) },
  }), 'ui-plugin-catalog: native controls and selective export')
}

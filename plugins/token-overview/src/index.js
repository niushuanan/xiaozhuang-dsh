/**
 * Token Overview, Host half.
 *
 * The canonical tokscale-token-report Skill owns collection, fork safety,
 * history recovery, pricing, and measurement semantics. This plugin only
 * schedules that trusted collector, swaps complete report snapshots, and
 * adapts the normalized artifacts for the compact Settings surface.
 */

import { spawn } from 'node:child_process'
import { readFile, rename, stat, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export const name = 'token-overview'
export const inject = ['webServer']

export const ROUTE_PATH = '/plugins/token-overview'
export const REFRESH_INTERVAL_MS = 10 * 60_000
export const RETRY_INTERVAL_MS = 60_000
export const REPORT_SCRIPT = join(homedir(), '.codex', 'skills', 'tokscale-token-report', 'scripts', 'tokscale_token_report.py')
export const DEFAULT_ARTIFACT_ROOT = join(homedir(), '.dsh', 'token-overview')

const SLOT_NAMES = Object.freeze(['a', 'b'])
const REQUIRED_ARTIFACTS = Object.freeze([
  'runtime.json',
  'hourly.today.json',
  'graph.today.json',
  'graph.week.json',
  'graph.month.json',
  'graph.all.json',
  'report.html',
  'data.js',
  'chart.umd.min.js',
])
const REPORT_FILES = new Set(['report.html', 'data.js', 'chart.umd.min.js'])
const OUTPUT_LIMIT = 64 * 1024
const ICON_URL = `${ROUTE_PATH}/assets/token-overview-icon.png`
const ICON_FILE = new URL('../assets/token-overview-icon.png', import.meta.url)

const CLIENT_LABELS = Object.freeze({
  claude: 'Claude Code',
  codex: 'Codex',
  dsh: 'DeepSeek Harness',
  opencode: 'OpenCode',
  workbuddy: 'WorkBuddy',
  zcode: 'Z Code',
})

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function tokenMetrics(tokens = {}) {
  const inputTokens = finite(tokens.input)
  const outputTokens = finite(tokens.output)
  const cacheReadTokens = finite(tokens.cacheRead)
  const cacheWriteTokens = finite(tokens.cacheWrite)
  const processedTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
  return {
    processedTokens,
    nonCacheTokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens: finite(tokens.reasoning),
  }
}

function addMetrics(target, metrics, cost = 0, calls = 0) {
  for (const key of [
    'processedTokens', 'nonCacheTokens', 'inputTokens', 'outputTokens',
    'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens',
  ]) target[key] += finite(metrics[key])
  target.cost += finite(cost)
  target.calls += finite(calls)
}

function emptyMetrics() {
  return {
    processedTokens: 0,
    nonCacheTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    cost: 0,
    calls: 0,
  }
}

function rankedValues(map, limit) {
  return [...map.values()]
    .sort((left, right) => right.processedTokens - left.processedTokens || right.calls - left.calls)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      cacheRatio: row.processedTokens > 0
        ? (row.cacheReadTokens + row.cacheWriteTokens) / row.processedTokens
        : 0,
    }))
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localHourKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return `${localDateKey(date)} ${String(date.getHours()).padStart(2, '0')}:00`
}

function trendMetrics(tokens = {}, calls = 0, cost = 0) {
  const inputTokens = finite(tokens.input ?? tokens.inputTokens)
  const outputTokens = finite(tokens.output ?? tokens.outputTokens)
  const cacheReadTokens = finite(tokens.cacheRead ?? tokens.cacheReadTokens)
  const cacheWriteTokens = finite(tokens.cacheWrite ?? tokens.cacheWriteTokens)
  return {
    processedTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    nonCacheTokens: inputTokens + outputTokens,
    calls: finite(calls),
    cost: finite(cost),
  }
}

function dailyTrend(contributions) {
  return contributions.map((day) => ({
    date: typeof day?.date === 'string' ? day.date : '',
    label: typeof day?.date === 'string' ? day.date.slice(5) : '',
    processedTokens: finite(day?.totals?.processedTokens ?? day?.totals?.tokens),
    nonCacheTokens: finite(day?.totals?.nonCacheTokens),
    calls: finite(day?.totals?.messages),
    cost: finite(day?.totals?.cost),
  }))
}

function monthlyTrend(contributions) {
  const months = new Map()
  for (const day of contributions) {
    const month = typeof day?.date === 'string' ? day.date.slice(0, 7) : ''
    if (month.length !== 7) continue
    const row = months.get(month) ?? { date: month, label: month, processedTokens: 0, nonCacheTokens: 0, calls: 0, cost: 0 }
    row.processedTokens += finite(day?.totals?.processedTokens ?? day?.totals?.tokens)
    row.nonCacheTokens += finite(day?.totals?.nonCacheTokens)
    row.calls += finite(day?.totals?.messages)
    row.cost += finite(day?.totals?.cost)
    months.set(month, row)
  }
  return [...months.values()]
}

/** Parse scanner NDJSON into session records, dropping torn lines individually. */
export function ndjsonSessions(output) {
  const sessions = []
  for (const line of String(output).split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const record = JSON.parse(line)
      if (record?.kind === 'session') sessions.push(record)
    } catch {
      continue
    }
  }
  return sessions
}

export function threeHourTrend(hourly) {
  const entries = Array.isArray(hourly?.entries) ? hourly.entries : []
  const date = typeof hourly?.date === 'string' ? hourly.date : localDateKey(Date.now())
  const buckets = Array.from({ length: 8 }, (_, index) => {
    const start = index * 3
    const end = start + 3
    return {
      date: `${date} ${String(start).padStart(2, '0')}:00`,
      label: `${String(start).padStart(2, '0')}–${String(end).padStart(2, '0')}`,
      processedTokens: 0,
      nonCacheTokens: 0,
      calls: 0,
      cost: 0,
    }
  })
  for (const entry of entries) {
    const hour = Number(String(entry?.hour ?? '').slice(11, 13))
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue
    const metrics = trendMetrics(entry, entry?.messageCount, entry?.cost)
    const bucket = buckets[Math.floor(hour / 3)]
    for (const key of ['processedTokens', 'nonCacheTokens', 'calls', 'cost']) bucket[key] += metrics[key]
  }
  return buckets
}

/** Convert one normalized graph artifact into the Settings contract. */
export function summarizeGraph(graph, rankLimit = Number.POSITIVE_INFINITY, trendMode = 'daily') {
  const clientRows = new Map()
  const modelRows = new Map()
  const contributions = Array.isArray(graph?.contributions) ? graph.contributions : []

  for (const day of contributions) {
    for (const entry of Array.isArray(day?.clients) ? day.clients : []) {
      const client = typeof entry?.client === 'string' && entry.client.length > 0 ? entry.client : 'unknown'
      const model = typeof entry?.modelId === 'string' && entry.modelId.length > 0 ? entry.modelId : 'unknown'
      const metrics = tokenMetrics(entry?.tokens)
      const clientRow = clientRows.get(client) ?? { id: client, label: CLIENT_LABELS[client] ?? client, ...emptyMetrics() }
      addMetrics(clientRow, metrics, entry?.cost, entry?.messages)
      clientRows.set(client, clientRow)

      const modelKey = `${client}/${model}`
      const modelRow = modelRows.get(modelKey) ?? {
        id: modelKey,
        label: model,
        client,
        clientLabel: CLIENT_LABELS[client] ?? client,
        ...emptyMetrics(),
      }
      addMetrics(modelRow, metrics, entry?.cost, entry?.messages)
      modelRows.set(modelKey, modelRow)
    }
  }

  const summary = graph?.summary ?? {}
  const processedTokens = finite(summary.processedTokens)
  const cacheReadTokens = finite(summary.cacheRead)
  const cacheWriteTokens = finite(summary.cacheWrite)
  const metrics = {
    processedTokens,
    nonCacheTokens: finite(summary.nonCacheTokens),
    inputTokens: finite(summary.input),
    outputTokens: finite(summary.output),
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens: finite(summary.reasoning),
    calls: finite(summary.modelCalls ?? summary.calls),
    cost: finite(summary.totalCost ?? summary.cost),
    cacheRatio: processedTokens > 0 ? (cacheReadTokens + cacheWriteTokens) / processedTokens : 0,
    activeDays: finite(summary.activeDays),
    totalDays: finite(summary.totalDays),
  }

  const trend = trendMode === 'monthly' ? monthlyTrend(contributions) : dailyTrend(contributions)

  return {
    range: graph?.meta?.dateRange ?? null,
    metrics,
    clients: rankedValues(clientRows, rankLimit),
    models: rankedValues(modelRows, rankLimit),
    trend,
    trendMeta: trendMode === 'monthly'
      ? { label: '按月处理量', ariaLabel: '全部历史每月处理量柱状图' }
      : { label: '每日处理量', ariaLabel: '每日处理量柱状图' },
  }
}

function dshBoundary(session) {
  if (Number.isInteger(session?.seedLength) && session.seedLength >= 0) return session.seedLength
  if (session?.hasParent && Number.isInteger(session?.firstEndSeedSeq) && session.firstEndSeedSeq >= 0) {
    return session.firstEndSeedSeq + 1
  }
  return 0
}

function pricingCost(tokens, model, pricingRows) {
  const row = pricingRows.find((candidate) => candidate?.model === model && candidate?.status === 'matched')
  if (row === undefined) return 0
  const fields = [
    ['input', tokens.input],
    ['cacheRead', tokens.cacheRead],
    ['cacheWrite', tokens.cacheWrite],
    ['output', tokens.output],
  ]
  if (fields.some(([key, count]) => finite(count) > 0 && row[key] == null)) return 0
  return fields.reduce((sum, [key, count]) => sum + finite(count) * finite(row[key]), 0) / 1_000_000
}

export function mergeHourlyToday(rawHourly, sessions, runtime) {
  const date = localDateKey(Date.now())
  const rows = new Map()
  const add = (hour, payload) => {
    if (!hour.startsWith(date)) return
    const row = rows.get(hour) ?? {
      hour,
      clients: new Set(),
      models: new Set(),
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      messageCount: 0,
      cost: 0,
    }
    for (const client of payload.clients ?? []) row.clients.add(client)
    for (const model of payload.models ?? []) row.models.add(model)
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'messageCount', 'cost']) {
      row[key] += finite(payload[key])
    }
    rows.set(hour, row)
  }

  for (const entry of Array.isArray(rawHourly?.entries) ? rawHourly.entries : []) {
    add(String(entry?.hour ?? ''), entry)
  }

  const pricingRows = Array.isArray(runtime?.pricingRows) ? runtime.pricingRows : []
  for (const session of sessions) {
    const boundary = dshBoundary(session)
    for (const usage of Array.isArray(session?.usage) ? session.usage : []) {
      if (!Number.isInteger(usage?.seq) || usage.seq < boundary || !Number.isInteger(usage?.time)) continue
      const hour = localHourKey(usage.time)
      if (!hour.startsWith(date)) continue
      const reasoning = finite(usage.reasoning)
      const tokens = {
        input: finite(usage.input),
        output: finite(usage.output) + reasoning,
        cacheRead: finite(usage.cacheRead),
        cacheWrite: finite(usage.cacheWrite),
      }
      add(hour, {
        clients: ['dsh'],
        models: [String(usage.model ?? 'unknown')],
        ...tokens,
        reasoning,
        messageCount: 1,
        cost: pricingCost(tokens, String(usage.model ?? 'unknown'), pricingRows),
      })
    }
  }

  const entries = Array.from({ length: 24 }, (_, hour) => {
    const key = `${date} ${String(hour).padStart(2, '0')}:00`
    const row = rows.get(key)
    return row === undefined
      ? { hour: key, clients: [], models: [], input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, messageCount: 0, cost: 0 }
      : { ...row, clients: [...row.clients].sort(), models: [...row.models].sort() }
  })
  return {
    meta: {
      generatedAt: runtime?.generatedAt,
      bucketHours: 1,
      source: 'Tokscale hourly + fork-safe DSH session scan',
    },
    date,
    entries,
  }
}

async function writeHourlyArtifact(directory, reportScript, runCommand) {
  const runtime = await readJson(join(directory, 'runtime.json'))
  const command = runtime?.runtime?.command
  if (!Array.isArray(command) || typeof command[0] !== 'string') throw new Error('Tokscale runtime command is unavailable')
  const hourlyRun = await runCommand(command[0], [
    ...command.slice(1), 'hourly', '--today', '--json', '--no-spinner',
  ])
  const rawHourly = JSON.parse(hourlyRun.stdout)
  let sessions = []
  if (runtime?.dsh?.enabled && typeof runtime?.dsh?.sessionsRoot === 'string') {
    try {
      const helper = join(dirname(reportScript), 'dsh_session_scan.mjs')
      const scan = await runCommand(process.execPath, [helper, '--root', runtime.dsh.sessionsRoot], { captureLimit: Number.POSITIVE_INFINITY })
      sessions = ndjsonSessions(scan.stdout)
    } catch {
      sessions = []
    }
  }
  const hourly = mergeHourlyToday(rawHourly, sessions, runtime)
  await writeFile(join(directory, 'hourly.today.json'), JSON.stringify(hourly, null, 2), 'utf8')
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'))
}

async function completeSlot(directory) {
  try {
    await Promise.all(REQUIRED_ARTIFACTS.map((filename) => stat(join(directory, filename))))
    return true
  } catch {
    return false
  }
}

async function overviewFromSlot(directory) {
  const [runtime, hourly, today, week, month, all] = await Promise.all([
    readJson(join(directory, 'runtime.json')),
    readJson(join(directory, 'hourly.today.json')),
    readJson(join(directory, 'graph.today.json')),
    readJson(join(directory, 'graph.week.json')),
    readJson(join(directory, 'graph.month.json')),
    readJson(join(directory, 'graph.all.json')),
  ])
  const generatedAt = Date.parse(runtime.generatedAt ?? all?.meta?.generatedAt ?? '')
  const history = runtime.history ?? {}
  const recoveries = Array.isArray(history.builtinRecoveries) ? history.builtinRecoveries : []
  const estimatedDates = [...new Set(recoveries.flatMap((item) => Array.isArray(item?.estimatedDates) ? item.estimatedDates : []))]
  const pricing = runtime.pricing ?? {}
  const ranges = {
    today: {
      ...summarizeGraph(today),
      trend: threeHourTrend(hourly),
      trendMeta: { label: '24 小时 · 每 3 小时', ariaLabel: '今日二十四小时每三小时处理量柱状图' },
    },
    week: summarizeGraph(week),
    month: summarizeGraph(month),
    all: summarizeGraph(all, Number.POSITIVE_INFINITY, 'monthly'),
  }
  const clients = ranges.all.clients.map((row) => row.label)
  return {
    generatedAt: Number.isFinite(generatedAt) ? generatedAt : Date.now(),
    runtime: {
      version: runtime.runtime?.version ?? all?.meta?.version ?? 'unknown',
      source: runtime.runtime?.source ?? 'unknown',
    },
    semantics: runtime.semantics ?? {},
    pricing: {
      detectedModels: finite(pricing.detectedModels),
      matchedModels: finite(pricing.matchedModels),
      unmatchedModels: Array.isArray(pricing.unmatchedModels) ? pricing.unmatchedModels : [],
    },
    history: {
      protectedDates: finite(history.protectedDates),
      restoredDates: Array.isArray(history.restoredDates) ? history.restoredDates.length : 0,
      estimatedDates,
    },
    dsh: {
      scannedSessions: finite(runtime.dsh?.sessions ?? runtime.dsh?.files ?? runtime.dsh?.scannedSessions ?? runtime.dsh?.sessionsScanned),
      skippedSessions: Array.isArray(runtime.dsh?.errors) ? runtime.dsh.errors.length : 0,
    },
    warnings: Array.isArray(runtime.warnings) ? runtime.warnings.slice(0, 6) : [],
    clients,
    ranges,
  }
}

async function readMarker(root) {
  try {
    const marker = await readJson(join(root, 'active.json'))
    if (!SLOT_NAMES.includes(marker.slot)) return undefined
    const directory = join(root, marker.slot)
    if (!await completeSlot(directory)) return undefined
    return { slot: marker.slot, directory, overview: await overviewFromSlot(directory) }
  } catch {
    return undefined
  }
}

async function detectLatestSlot(root) {
  const candidates = []
  for (const slot of SLOT_NAMES) {
    const directory = join(root, slot)
    if (!await completeSlot(directory)) continue
    try {
      const overview = await overviewFromSlot(directory)
      candidates.push({ slot, directory, overview })
    } catch {}
  }
  return candidates.sort((left, right) => right.overview.generatedAt - left.overview.generatedAt)[0]
}

async function writeMarker(root, slot, generatedAt) {
  const temporary = join(root, `active.${process.pid}.tmp`)
  await writeFile(temporary, JSON.stringify({ slot, generatedAt }), 'utf8')
  await rename(temporary, join(root, 'active.json'))
}

function appendOutput(current, chunk, captureLimit = OUTPUT_LIMIT) {
  const next = current + chunk.toString('utf8')
  if (captureLimit === Number.POSITIVE_INFINITY) return next
  return next.length > captureLimit ? next.slice(-captureLimit) : next
}

function collectorEnvironment() {
  const path = [
    join(homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH,
  ].filter(Boolean).join(':')
  return { ...process.env, PATH: path }
}

/** Background collector with fixed ten-minute start cadence and no overlap. */
export function createCollector(config = {}) {
  const root = typeof config.artifactRoot === 'string' ? config.artifactRoot : DEFAULT_ARTIFACT_ROOT
  const script = typeof config.reportScript === 'string' ? config.reportScript : REPORT_SCRIPT
  const python = typeof config.python === 'string' ? config.python : '/usr/bin/python3'
  const refreshIntervalMs = Number.isFinite(config.refreshIntervalMs) ? config.refreshIntervalMs : REFRESH_INTERVAL_MS
  let active
  let phase = 'starting'
  let startedAt
  let nextRefreshAt
  let lastError
  let timer
  let child
  let disposed = false

  const snapshot = () => ({
    phase,
    refreshing: phase === 'refreshing',
    updatedAt: active?.overview.generatedAt,
    nextRefreshAt,
    startedAt,
    lastError,
    reportUrl: active === undefined ? undefined : `${ROUTE_PATH}/report/`,
    overview: active?.overview,
  })

  const schedule = (delay) => {
    if (disposed) return
    if (timer !== undefined) clearTimeout(timer)
    const safeDelay = Math.max(1_000, delay)
    nextRefreshAt = Date.now() + safeDelay
    timer = setTimeout(() => { void refresh() }, safeDelay)
  }

  const runCommand = (program, args, options = {}) => new Promise((resolve, reject) => {
    const captureLimit = options.captureLimit ?? OUTPUT_LIMIT
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (callback) => {
      if (settled) return
      settled = true
      child = undefined
      callback()
    }
    child = spawn(program, args, { env: collectorEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk) => { stdout = appendOutput(stdout, chunk, captureLimit) })
    child.stderr.on('data', (chunk) => { stderr = appendOutput(stderr, chunk) })
    child.once('error', (error) => { finish(() => reject(error)) })
    child.once('exit', (exitCode, signal) => {
      finish(() => {
        if (signal != null) return reject(new Error(`${basename(program)} stopped by ${signal}`))
        const code = exitCode ?? 1
        if (code !== 0) return reject(new Error(`${basename(program)} exited ${code}: ${(stderr || stdout).trim().slice(-1_200)}`))
        resolve({ stdout, stderr })
      })
    })
  })

  const refresh = async () => {
    if (disposed || child !== undefined) return
    const runStartedAt = Date.now()
    startedAt = runStartedAt
    phase = 'refreshing'
    lastError = undefined
    nextRefreshAt = undefined
    await mkdir(root, { recursive: true })
    const slot = active?.slot === 'a' ? 'b' : 'a'
    const directory = join(root, slot)
    await mkdir(directory, { recursive: true })
    const args = [script, '--out-dir', directory, '--no-open', '--ttl-hours', '0']
    try {
      await runCommand(python, args)
      await writeHourlyArtifact(directory, script, runCommand)
      if (!await completeSlot(directory)) throw new Error('collector completed without the required report artifacts')
      const overview = await overviewFromSlot(directory)
      await writeMarker(root, slot, overview.generatedAt)
      active = { slot, directory, overview }
      phase = 'ready'
      startedAt = undefined
      const nextStart = runStartedAt + refreshIntervalMs
      schedule(Math.max(1_000, nextStart - Date.now()))
    } catch (error) {
      child = undefined
      phase = active === undefined ? 'error' : 'stale'
      startedAt = undefined
      lastError = error instanceof Error ? error.message : String(error)
      schedule(Math.min(RETRY_INTERVAL_MS, refreshIntervalMs))
    }
  }

  const start = async () => {
    await mkdir(root, { recursive: true })
    active = await readMarker(root) ?? await detectLatestSlot(root)
    if (active !== undefined) {
      await writeMarker(root, active.slot, active.overview.generatedAt)
      phase = 'ready'
      const age = Date.now() - active.overview.generatedAt
      if (age < refreshIntervalMs) schedule(refreshIntervalMs - age)
      else void refresh()
    } else {
      void refresh()
    }
  }

  const dispose = () => {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    if (child !== undefined) child.kill('SIGTERM')
  }

  return {
    start,
    refresh,
    dispose,
    snapshot,
    reportDirectory: () => active?.directory,
  }
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function contentType(filename) {
  if (filename === 'report.html') return 'text/html; charset=utf-8'
  if (filename.endsWith('.js')) return 'text/javascript; charset=utf-8'
  return 'application/octet-stream'
}

function createHandler(collector) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === ICON_URL) {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      try {
        const data = await readFile(ICON_FILE)
        res.statusCode = 200
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.end(data)
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    }
    if (url.pathname === `${ROUTE_PATH}/api/status`) {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      return json(res, 200, collector.snapshot())
    }
    if (url.pathname === `${ROUTE_PATH}/report`) {
      res.statusCode = 302
      res.setHeader('Location', `${ROUTE_PATH}/report/`)
      return res.end()
    }
    if (!url.pathname.startsWith(`${ROUTE_PATH}/report/`)) return json(res, 404, { error: 'not found' })
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
    const requested = url.pathname.endsWith('/report/') ? 'report.html' : basename(url.pathname)
    if (!REPORT_FILES.has(requested)) return json(res, 404, { error: 'not found' })
    const directory = collector.reportDirectory()
    if (directory === undefined) return json(res, 503, { error: '报告正在生成' })
    try {
      const data = await readFile(join(directory, requested))
      res.statusCode = 200
      res.setHeader('Content-Type', contentType(requested))
      res.setHeader('Cache-Control', 'no-store')
      res.end(data)
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export function apply(ctx, config = {}) {
  const collector = createCollector(config)
  const unregister = ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PATH,
    handler: createHandler(collector),
  })
  void collector.start()
  ctx.effect(() => () => {
    collector.dispose()
    unregister()
  }, 'token-overview: ten-minute canonical report collector')
}

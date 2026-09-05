import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REFRESH_INTERVAL_MS, REPORT_SCRIPT, mergeHourlyToday, ndjsonSessions, summarizeGraph, threeHourTrend } from '../lib/index.js'
import * as hourlyPricing from '../lib/hourly-pricing.js'

const graph = {
  meta: { dateRange: { start: '2026-08-23', end: '2026-08-23' } },
  summary: {
    processedTokens: 1_000,
    nonCacheTokens: 150,
    input: 100,
    output: 50,
    cacheRead: 850,
    cacheWrite: 0,
    reasoning: 20,
    modelCalls: 4,
    totalCost: 1.25,
    activeDays: 1,
    totalDays: 1,
  },
  contributions: [{
    date: '2026-08-23',
    totals: { processedTokens: 1_000, nonCacheTokens: 150, messages: 4, cost: 1.25 },
    clients: [
      { client: 'codex', modelId: 'gpt-5.6-sol', tokens: { input: 80, output: 40, cacheRead: 800 }, cost: 1, messages: 3 },
      { client: 'dsh', modelId: 'DeepSeek-V4-Pro', tokens: { input: 20, output: 10, cacheRead: 50 }, cost: 0.25, messages: 1 },
    ],
  }],
}

test('uses the canonical Skill and a ten-minute refresh interval', () => {
  assert.equal(REFRESH_INTERVAL_MS, 600_000)
  assert.match(REPORT_SCRIPT, /\.codex\/skills\/tokscale-token-report\/scripts\/tokscale_token_report\.py$/)
})

test('parses scanner NDJSON while dropping torn or interleaved lines individually', () => {
  const output = [
    JSON.stringify({ kind: 'session', id: 'first', usage: [] }),
    '{torn line from a truncated capture',
    '',
    JSON.stringify({ kind: 'meta', files: 2 }),
    JSON.stringify({ kind: 'session', id: 'second', usage: [{ seq: 1, time: 1 }] }),
  ].join('\n')
  const sessions = ndjsonSessions(output)
  assert.equal(sessions.length, 2)
  assert.equal(sessions[0].id, 'first')
  assert.equal(sessions[1].id, 'second')
})

test('keeps processed, non-cache, reasoning, cache, calls and cost semantics separate', () => {
  const result = summarizeGraph(graph)
  assert.deepEqual(result.metrics, {
    processedTokens: 1_000,
    nonCacheTokens: 150,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 850,
    cacheWriteTokens: 0,
    reasoningTokens: 20,
    calls: 4,
    cost: 1.25,
    cacheRatio: 0.85,
    activeDays: 1,
    totalDays: 1,
  })
  assert.equal(result.clients[0].label, 'Codex')
  assert.equal(result.models[0].id, 'codex/gpt-5.6-sol')
  assert.equal(result.trend[0].processedTokens, 1_000)
})

test('ranks clients and models by processed volume without adding reasoning twice', () => {
  const result = summarizeGraph(graph)
  assert.equal(result.clients[0].processedTokens, 920)
  assert.equal(result.clients[0].nonCacheTokens, 120)
  assert.equal(result.clients[1].processedTokens, 80)
  assert.equal(result.models[0].reasoningTokens, 0)
})

test('fills the whole local day and groups real hourly usage into eight three-hour buckets', () => {
  const now = new Date()
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
  const dshTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 20).getTime()
  const hourly = mergeHourlyToday({
    entries: [{ hour: `${date} 01:00`, clients: ['codex'], models: ['gpt-5.6-sol'], input: 100, output: 20, cacheRead: 880, cacheWrite: 0, messageCount: 2, cost: 1 }],
  }, [{ seedLength: 1, usage: [
    { seq: 0, time: dshTime, model: 'deepseek-v4-pro', input: 999, output: 999, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
    { seq: 1, time: dshTime, model: 'deepseek-v4-pro', input: 40, output: 10, cacheRead: 50, cacheWrite: 0, reasoning: 5 },
  ] }], {
    generatedAt: now.toISOString(),
    pricingRows: [{ model: 'deepseek-v4-pro', status: 'matched', input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 }],
  })
  assert.equal(hourly.entries.length, 24)
  assert.equal(hourly.entries[1].input, 100)
  assert.equal(hourly.entries[4].input, 40)
  assert.equal(hourly.entries[4].output, 15)
  const trend = threeHourTrend(hourly)
  assert.equal(trend.length, 8)
  assert.equal(trend[0].processedTokens, 1_000)
  assert.equal(trend[1].processedTokens, 105)
  assert.equal(trend[7].processedTokens, 0)
})

test('hourly pricing uses the report rates without changing the global configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-hourly-pricing-test-'))
  try {
    const source = join(root, 'global')
    await mkdir(join(source, 'cache'), { recursive: true })
    const original = JSON.stringify({ timestamp: 1, data: { 'glm-4.7-flash': { input_cost_per_token: .00006 } } })
    await writeFile(join(source, 'cache', 'pricing-litellm.json'), original)
    await writeFile(join(source, 'settings.json'), JSON.stringify({ modelAliases: { 'my-sol': 'gpt-5.6-sol' } }))
    const runtime = { pricingRows: [
      { model: 'gpt-5.6-sol', status: 'matched', input: 4, output: 20, cacheRead: .4, cacheWrite: 5 },
      { model: 'k3[1m]', matchedKey: 'kimi-k3', status: 'matched', input: 3, output: 15, cacheRead: .3, cacheWrite: null },
      { model: 'glm-4.7-flash', status: 'matched', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      { model: 'auto', status: 'unmatched', input: null, output: null },
    ] }
    const config = await hourlyPricing.prepareHourlyPricing(join(root, 'report'), runtime, source)
    const custom = JSON.parse(await readFile(join(config, 'custom-pricing.json'), 'utf8'))
    assert.equal(custom.models['gpt-5.6-sol'].input_cost_per_token, .000004)
    assert.equal(custom.models['gpt-5.6-sol'].output_cost_per_token, .000020)
    assert.ok(Math.abs(custom.models['gpt-5.6-sol'].cache_read_input_token_cost - .0000004) < 1e-20)
    assert.equal(custom.models['gpt-5.6-sol'].cache_creation_input_token_cost, .000005)
    assert.equal(custom.models['k3[1m]'].input_cost_per_token, .000003)
    assert.equal(custom.models.auto, undefined)
    const catalog = JSON.parse(await readFile(join(config, 'cache', 'pricing-litellm.json'), 'utf8'))
    assert.equal(catalog.data['glm-4.7-flash'].input_cost_per_token, 0)
    assert.equal(catalog.data['glm-4.7-flash'].output_cost_per_token, 0)
    assert.equal(await readFile(join(source, 'cache', 'pricing-litellm.json'), 'utf8'), original)
    assert.deepEqual(JSON.parse(await readFile(join(config, 'settings.json'), 'utf8')), { modelAliases: { 'my-sol': 'gpt-5.6-sol' } })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

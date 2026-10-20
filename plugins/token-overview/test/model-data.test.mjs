import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeModelId, normalizeDashboard, filterDashboard } from '../src/model-data.js'

const data = {
  days: ['2026-10-19', '2026-10-20'], clients: ['codex', 'zcode', 'dsh'],
  modelCatalog: [
    { label: 'a', client: 'codex', model: 'deepseek-flash', vendor: 'DeepSeek' },
    { label: 'b', client: 'zcode', model: 'DeepSeek_Flash', vendor: 'DeepSeek' },
    { label: 'c', client: 'zcode', model: 'deepseek/deepseek-flash', vendor: 'DeepSeek' },
    { label: 'd', client: 'dsh', model: 'gpt-5.6-sol', vendor: 'OpenAI' },
  ],
  dailyModels: {
    a: { processedTokens: [100, 200], cost: [1, 2], calls: [1, 2] },
    b: { processedTokens: [30, 40], cost: [.3, .4], calls: [3, 4] },
    c: { processedTokens: [5, 6], cost: [.05, .06], calls: [1, 1] },
    d: { processedTokens: [10, 20], cost: [1, 2], calls: [1, 1] },
  },
  dailyTotals: { processedTokens: [145, 266], cost: [2.35, 4.46] },
}

test('normalization unifies spelling and known namespaces while preserving model variants', () => {
  assert.equal(normalizeModelId(' DeepSeek_Flash '), 'deepseek-flash')
  assert.equal(normalizeModelId('deepseek/DeepSeek Flash'), 'deepseek-flash')
  assert.equal(normalizeModelId('openai/gpt-5.6-sol'), 'gpt-5.6-sol')
  assert.notEqual(normalizeModelId('deepseek-flash'), normalizeModelId('DeepSeek-V4-Flash'))
  assert.notEqual(normalizeModelId('DeepSeek-V4-Flash'), normalizeModelId('DeepSeek-V4-Pro'))
  assert.notEqual(normalizeModelId('gpt-5.6-sol'), normalizeModelId('gpt-5.6-terra'))
})

test('normalization merges within a platform and filtering recalculates totals without changing source data', () => {
  const before = JSON.stringify(data)
  const normalized = normalizeDashboard(data)
  assert.equal(normalized.modelCatalog.length, 3)
  assert.deepEqual(normalized.dailyModels['zcode/deepseek-flash'].processedTokens, [35, 46])
  const filtered = filterDashboard(normalized, { query: 'DEEPSEEK FLASH', vendor: 'DeepSeek', model: 'deepseek-flash' })
  assert.equal(filtered.modelCatalog.length, 2)
  assert.deepEqual(filtered.dailyTotals.processedTokens, [135, 246])
  assert.equal(filtered.dailyTotals.cost.reduce((a, b) => a + b, 0), 3.81)
  assert.deepEqual(filtered.dailyTotals.calls, [5, 7])
  assert.deepEqual(filterDashboard(normalized, { query: 'no-such-model' }).dailyTotals.processedTokens, [0, 0])
  assert.equal(filterDashboard(normalized, {}), normalized)
  assert.equal(JSON.stringify(data), before)
})

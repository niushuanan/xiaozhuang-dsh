/** Model identities and report projections; source records and prices stay untouched. */
export const MODEL_METRICS = [
  'processedTokens', 'nonCacheTokens', 'inputTokens', 'outputTokens',
  'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'cost', 'calls',
]

/** Normalize spelling and known provider namespaces, retaining versions and variants. */
export function normalizeModelId(value) {
  return String(value || 'unknown').trim().toLowerCase()
    .replace(/^(?:openai|anthropic|deepseek|moonshotai|moonshotai_cn|zai|zhipu|google|xai|qwen|minimax)\//, '')
    .replace(/[\s_]+/g, '-')
}

const emptySeries = (length) => Object.fromEntries(MODEL_METRICS.map(key => [key, Array(length).fill(0)]))
const addSeries = (target, source, length) => {
  for (const key of MODEL_METRICS) {
    for (let index = 0; index < length; index++) target[key][index] += Number(source?.[key]?.[index]) || 0
  }
}

/** Merge equivalent spellings within each platform, preserving raw names for lookup. */
export function normalizeDashboard(data) {
  if (!data) return data
  const rows = new Map()
  const dailyModels = {}
  const length = data.days?.length || 0
  for (const item of data.modelCatalog || []) {
    const model = normalizeModelId(item.model)
    const label = `${item.client}/${model}`
    let row = rows.get(label)
    if (!row) {
      row = { ...item, label, model, aliases: [] }
      rows.set(label, row)
      dailyModels[label] = emptySeries(length)
    }
    row.aliases.push(...(item.aliases || [item.model]))
    addSeries(dailyModels[label], data.dailyModels?.[item.label], length)
  }
  return { ...data, modelCatalog: [...rows.values()], dailyModels }
}

/** Project model search and selection into every daily metric without recalculating prices. */
export function filterDashboard(data, { query = '', vendor = 'all', model = 'all' } = {}) {
  const terms = normalizeModelId(query.trim() || ' ').split(/[\s/-]+/).filter(Boolean)
  if (!query.trim() && vendor === 'all' && model === 'all') return data
  const modelCatalog = (data.modelCatalog || []).filter(item => {
    const text = normalizeModelId([item.model, ...(item.aliases || []), item.vendor, item.provider, item.client].join(' '))
    return (!query.trim() || terms.every(term => text.includes(term)))
      && (vendor === 'all' || item.vendor === vendor) && (model === 'all' || item.model === model)
  })
  const length = data.days?.length || 0
  const dailyTotals = emptySeries(length)
  const dailyClients = Object.fromEntries((data.clients || []).map(client => [client, emptySeries(length)]))
  for (const item of modelCatalog) {
    const source = data.dailyModels[item.label]
    dailyClients[item.client] ||= emptySeries(length)
    addSeries(dailyClients[item.client], source, length)
    addSeries(dailyTotals, source, length)
  }
  return { ...data, modelCatalog, dailyTotals, dailyClients }
}

/** Combine platforms for model-only charts and tables, retaining contributing platform labels. */
export function groupModels(data, client = 'all') {
  const rows = new Map()
  for (const item of data.modelCatalog || []) {
    if (client !== 'all' && item.client !== client) continue
    const key = item.model === 'unknown' || item.model === '<synthetic>' ? item.label : item.model
    let row = rows.get(key)
    if (!row) {
      row = { ...item, label: key, clients: [], source: emptySeries(data.days?.length || 0) }
      rows.set(key, row)
    }
    if (!row.clients.includes(item.client)) row.clients.push(item.client)
    addSeries(row.source, data.dailyModels?.[item.label], data.days?.length || 0)
  }
  return [...rows.values()]
}

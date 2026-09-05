import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const FIELDS = {
  input: 'input_cost_per_token',
  output: 'output_cost_per_token',
  cacheRead: 'cache_read_input_token_cost',
  cacheWrite: 'cache_creation_input_token_cost',
}

/** Pass the Skill's price snapshot into Tokscale's native per-message calculator.
 * The isolated config keeps global prices/settings and original logs untouched.
 * Reference: tokscale v4.5.3 pricing/custom.rs and paths.rs.
 */
export async function prepareHourlyPricing(directory, runtime, source = process.env.TOKSCALE_CONFIG_DIR || join(homedir(), '.config', 'tokscale')) {
  const config = join(directory, 'hourly-pricing')
  const cache = join(config, 'cache')
  await mkdir(cache, { recursive: true })
  // Keep scanner settings and fallback catalog coverage from the normal runtime.
  for (const file of ['settings.json', 'cache/pricing-litellm.json', 'cache/pricing-openrouter.json', 'cache/pricing-models-dev.json']) {
    try { await copyFile(join(source, file), join(config, file)) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const models = {}
  const free = {}
  for (const row of runtime.pricingRows ?? []) {
    if (row.status !== 'matched' || row.input == null || row.output == null) continue
    const rates = Object.fromEntries(Object.entries(FIELDS)
      .filter(([field]) => row[field] != null)
      .map(([field, native]) => [native, row[field] / 1_000_000]))
    const target = row.input === 0 && row.output === 0 ? free : models
    for (const key of new Set([row.model, row.matchedKey].filter(Boolean))) target[key.toLowerCase()] = rates
  }
  await writeFile(join(config, 'custom-pricing.json'), JSON.stringify({ models }), 'utf8')
  // Native custom prices reject all-zero rows. Its exact LiteLLM table accepts
  // genuine free models, so overlay only those verified rows in this private copy.
  if (Object.keys(free).length) {
    let catalog = { data: {} }
    try { catalog = JSON.parse(await readFile(join(cache, 'pricing-litellm.json'), 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    catalog.data = { ...catalog.data, ...free }
    catalog.timestamp = Math.floor(Date.now() / 1_000)
    await writeFile(join(cache, 'pricing-litellm.json'), JSON.stringify(catalog), 'utf8')
  }
  return config
}

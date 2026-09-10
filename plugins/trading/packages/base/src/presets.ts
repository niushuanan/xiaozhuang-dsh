/** Host registration for the optional trading roles bundled by this product plugin. */
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-presets'

export const name = 'dsh-trading-role-presets'
export const inject = ['agentPresets']
export const DEFAULT_PRESET_ROOT = fileURLToPath(new URL('../assets/presets/', import.meta.url))
export const PRESET_IDS = ['trading-trader', 'trading-researcher', 'trading-risk-reviewer', 'trading-master'] as const

/** Resolve an owned package export without adding trading packages to the host profile. */
function tradingModuleUrl(specifier: string): string {
  const [, packageName, ...segments] = specifier.split('/')
  const packageRoot = new URL(`../../${packageName}/`, import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) as {
    exports: Record<string, string | { default?: string }>
  }
  const entry = manifest.exports[segments.length === 0 ? '.' : `./${segments.join('/')}`]
  const target = typeof entry === 'string' ? entry : entry?.default
  if (target === undefined) throw new Error(`Trading preset names an unavailable export: ${specifier}`)
  const url = new URL(target, packageRoot)
  if (!existsSync(url)) throw new Error(`Trading preset requires a built module: ${specifier}`)
  return url.href
}

/**
 * Add bundled roles using process-owned resources with installed module URLs.
 * Native preset copies retain those URLs and remain bound to this installation.
 * @param ctx - Host context with the native preset registry.
 */
export async function apply(ctx: Context): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-trading-presets-'))
  try {
    for (const id of PRESET_IDS) {
      const destination = join(root, id)
      await cp(join(DEFAULT_PRESET_ROOT, id), destination, { recursive: true })
      const composition = join(destination, 'agent.cordis.yml')
      const text = await readFile(composition, 'utf8')
      const resolved = text.replace(
        /^([ \t]*name:[ \t]*)(['"])(@dshtrading\/[^'"]+)\2[ \t]*$/gm,
        (_line, prefix: string, _quote: string, specifier: string) => `${prefix}${JSON.stringify(tradingModuleUrl(specifier))}`,
      )
      await writeFile(composition, resolved, 'utf8')
    }
    ctx.effect(() => {
      const unregister = ctx.agentPresets.registerRoot({ path: root, trust: 'system' })
      return async () => {
        unregister()
        await rm(root, { recursive: true, force: true })
      }
    }, 'trading: optional role preset root')
  } catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

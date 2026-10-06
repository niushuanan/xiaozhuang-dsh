/** Profile-owned custom modes and the authenticated maintenance boundary for mode switching. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { openNativeTextFile } from '@deepseek-ai/dsh-native-command'
import yaml from 'js-yaml'

export interface Config { customPresets: PresetDefinition[] }
export const Config: z<Config> = z.object({ customPresets: z.array(z.any()).default([]) }) as z<Config>
export const inject = ['agentPresets', 'settings', 'configEditor']
const PATH = '/api/session-modes'
interface Connection { fetch: { register(route: { path: string; methods: readonly ['POST']; fetch(request: Request): Promise<Response> }): () => Promise<void> } }
const reply = (value: unknown): Response => Response.json({ ok: true, value })

export async function apply(ctx: Context, config: Config): Promise<void> {
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber))
  for (const definition of config.customPresets) {
    ctx.effect(() => ctx.agentPresets.register(definition), 'session-modes: custom preset')
  }
  const edit = async (change: (rows: PresetDefinition[]) => PresetDefinition[]): Promise<void> => {
    const entry = ctx.fiber.entry
    if (entry === undefined) throw new Error('Mode configuration entry is unavailable')
    await ctx.configEditor.edit(entry, current => ({ ...current,
      customPresets: change((current.customPresets ?? []) as PresetDefinition[]),
    }))
  }
  ctx.inject(['connection', 'sessionController'], routeCtx => {
    const connection = routeCtx.get('connection') as unknown as Connection
    routeCtx.effect(() => connection.fetch.register({ path: PATH, methods: ['POST'], fetch: async request => {
      try {
        const input = await request.json() as { action: string; id?: string; from?: string; name?: string; sessionId?: string }
        if (input.action === 'list') {
          const roster = await ctx.agentPresets.remoteExportList()
          const own = new Set(config.customPresets.map(row => row.id))
          return reply({ ...roster, authorable: true, presets: roster.presets.map(row => ({ ...row, trust: own.has(row.id) ? 'user' : 'system' })) })
        }
        if (input.action === 'canOpen') return reply(true)
        if (input.action === 'location') {
          const path = ctx.configEditor.documentPath
          await openNativeTextFile(path, request.signal)
          return reply({ opened: true, path })
        }
        if (typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(input.id)) throw new Error('Invalid mode id')
        if (input.action === 'copy') {
          if (typeof input.from !== 'string') throw new Error('Source mode is required')
          if ((await ctx.agentPresets.list()).some(row => row.id === input.id)) throw new Error('Mode id already exists')
          const source = await ctx.agentPresets.readDocument(input.from)
          const plugins = yaml.load(source.content, { schema: entryListSchema }) as PresetDefinition['plugins']
          const id = input.id
          await edit(rows => [...rows, { id, ...(input.name?.trim() ? { name: input.name.trim() } : {}), plugins }])
          return reply(undefined)
        }
        if (input.action === 'delete') {
          const id = input.id
          if (!config.customPresets.some(row => row.id === id)) throw new Error('Only custom modes can be deleted')
          if (ctx.agentPresets.defaultId === id) await ctx.settings.mutate('agent-preset-registry', [{ op: 'unset', path: ['selectedDefault'] }])
          await edit(rows => rows.filter(row => row.id !== id))
          return reply(undefined)
        }
        if (input.action === 'select') {
          if (typeof input.sessionId !== 'string') throw new Error('Session is required')
          const resolved = await routeCtx.sessionController.resolveAgent(SessionId(input.sessionId))
          if ('error' in resolved) throw resolved.error
          const agent = resolved.agent
          const id = input.id
          return reply(await agent.runMaintenance(async () => {
            const selected = await ctx.agentPresets.recompose(agent.ctx, id)
            agent.session.append('agent-preset/selected', { agentPreset: selected.id })
            return selected.id
          }))
        }
        throw new Error('Unknown mode operation')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const code = /maintenance|idle|busy|running/i.test(message) ? 'agent-preset/busy' : 'session-modes/rejected'
        return Response.json({ ok: false, error: { code, message, details: {} } })
      }
    } }), 'session-modes: authenticated operations')
  })
}

// Preserve child expression declarations until their own preset scopes activate.
export default { name: 'session-modes', inject, Config, apply, [EntryGroup.key]: true }

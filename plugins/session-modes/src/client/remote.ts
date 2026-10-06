/** Adapter for plugin-owned mode management; standard settings retain their current Remote owner. */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { AgentPresetDocument, AgentPresetRoster as HostRoster } from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
export type AgentPresetRoster = { authorable: boolean; presets: readonly (HostRoster['presets'][number] & { trust: 'system' | 'user' })[] }
type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } }
export interface SessionModesRemote {
  agentPresets: {
    list(): Promise<Result<AgentPresetRoster>>
    read(id: string): Promise<Result<AgentPresetDocument>>
    copy(from: string, id: string, name: string | undefined): Promise<Result<void>>
    deletePreset(id: string): Promise<Result<void>>
    select(sessionId: SessionId, id: string): Promise<Result<string>>
  }
  settings: ClientRemote['settings'] & {
    canOpenAgentPresetDirectory(): Promise<Result<boolean>>
    openAgentPresetDirectory(id: string): Promise<Result<{ opened: boolean; path: string }>>
  }
}
async function call<T>(input: unknown): Promise<Result<T>> {
  const response = await fetch('/api/session-modes', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  if (!response.ok) throw new Error(`Mode operation failed (${response.status})`)
  return await response.json() as Result<T>
}
export function sessionModesRemote(remote: ClientRemote): SessionModesRemote {
  return {
    agentPresets: {
      list: () => call({ action: 'list' }),
      read: id => remote.agentPresets.read(id),
      copy: (from, id, name) => call({ action: 'copy', from, id, name }),
      deletePreset: id => call({ action: 'delete', id }),
      select: (sessionId, id) => call({ action: 'select', sessionId, id }),
    },
    settings: Object.assign(Object.create(remote.settings) as ClientRemote['settings'], {
      canOpenAgentPresetDirectory: () => call<boolean>({ action: 'canOpen' }),
      openAgentPresetDirectory: (id: string) => call<{ opened: boolean; path: string }>({ action: 'location', id }),
    }),
  }
}

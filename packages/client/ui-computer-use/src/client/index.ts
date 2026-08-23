/** Computer Use Settings section and native tool rows. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ComputerUseSettings } from './ComputerUseSettings.tsx'
import type { ComputerUsePreferences, ComputerUseSettingsInjected, ComputerUseStatus } from './ComputerUseSettings.tsx'
import { ComputerUseToolRow } from './ComputerUseToolRow.tsx'
import { BrowserWorkspace, BrowserWorkspaceTrigger } from './BrowserWorkspace.tsx'
import type {
  BrowserWorkspaceAction, BrowserWorkspaceInjected, BrowserWorkspaceResponse, BrowserWorkspaceState,
} from './BrowserWorkspace.tsx'
import { en, zh, type ComputerUseLocaleKey } from './locales.ts'

export type { ComputerUseSettingsInjected, ComputerUseSettingsProps, ComputerUsePreferences, ComputerUseStatus } from './ComputerUseSettings.tsx'
export type { ComputerUseLocaleKey } from './locales.ts'
export type {
  BrowserWorkspaceAction, BrowserWorkspaceInjected, BrowserWorkspaceResponse, BrowserWorkspaceState,
} from './BrowserWorkspace.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.computerUse': ComputerUseLocaleKey
  }
}

/** Locale namespace owned by the Computer Use Settings section. */
export const NS = 'settings.computerUse'
export const inject = ['slots', 'locale', 'settingsScope']

const TOOL_NAMES = [
  'computer_list_apps', 'computer_get_state', 'computer_click', 'computer_secondary_action',
  'computer_scroll', 'computer_drag', 'computer_type_text', 'computer_press_key', 'computer_set_value',
  'browser_open', 'browser_snapshot', 'browser_click', 'browser_fill', 'browser_press_key',
  'browser_scroll', 'browser_tabs', 'browser_use_tab', 'browser_close',
] as const

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, { cache: 'no-store', ...init })
  if (!response.ok) throw new Error(`Computer Use request failed: ${response.status}`)
  return response
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...init })
  const value = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(value.error ?? `Computer Use request failed: ${response.status}`)
  return value
}

/** Register the section and one native presentation for every scoped tool. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-computer-use: dictionaries')
  const settings = ctx.settingsScope.bind<ComputerUsePreferences>({ namespace: 'computer-use' })
  const injected = (): ComputerUseSettingsInjected => ({
    settings,
    status: async () => (await request('/computer-use/status')).json() as Promise<ComputerUseStatus>,
    setupDesktop: async () => { await request('/computer-use/setup-desktop', { method: 'POST' }) },
    openExtension: async () => { await request('/computer-use/open-extension', { method: 'POST' }) },
  })
  const workspaceInjected = (): BrowserWorkspaceInjected => ({
    settings,
    status: async () => requestJson<ComputerUseStatus>('/computer-use/status'),
    workspace: async sessionId => requestJson<BrowserWorkspaceResponse>(
      `/computer-use/workspace?sessionId=${encodeURIComponent(sessionId)}`,
    ),
    act: async (value: BrowserWorkspaceAction) => {
      const response = await requestJson<{ state: BrowserWorkspaceState }>('/computer-use/workspace/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      })
      return response.state
    },
    screenshotUrl: (sessionId, version) => (
      `/computer-use/workspace/screenshot?sessionId=${encodeURIComponent(sessionId)}&v=${String(version)}`
    ),
  })
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'computer-use',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, ComputerUseSettings))
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const key of TOOL_NAMES) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key, locale: NS }, ComputerUseToolRow)
    }
  })
  ctx.slots.inject('conversation.session.workspace', () => ctx.slots.register({
    name: 'conversation.session.workspace',
    locale: NS,
    inject: workspaceInjected,
  }, BrowserWorkspace))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'computer-use-workspace',
    order: 30,
    locale: NS,
  }, BrowserWorkspaceTrigger))
}

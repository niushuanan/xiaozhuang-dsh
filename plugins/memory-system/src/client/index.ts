/** Browser half of the native two-document memory system. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { IconMemoryOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MemorySettings } from './MemorySettings.tsx'
import { en, NS, zh, type MemoryLocaleKey } from './locales.ts'

export { MemorySettings } from './MemorySettings.tsx'
export { loadMemoryDocuments, organizeAiMemory, rememberSelection, restoreMemoryDocument, saveMemoryDocument } from './api.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { memorySystem: MemoryLocaleKey }
}
export const inject = ['slots', 'locale']

/** Register the global memory editor as one native Settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'memory-system: dictionaries')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'memory-system',
    order: 55,
    label: () => ctx.locale.bind(NS)('title'),
    locale: NS,
  }, MemorySettings))
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon', id: 'memory-system',
  }, IconMemoryOutline16))
}

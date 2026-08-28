/** Browser half registering the native Continuous Adaptation Settings page. */

import type { ClientContext } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { AdaptiveUpdateSection } from './AdaptiveUpdateSection.tsx'
import { en, zh, type AdaptiveUpdateLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.adaptiveUpdate': AdaptiveUpdateLocaleKey
  }
}

const NS = 'settings.adaptiveUpdate'
export const inject = ['slots', 'locale']

/** Contribute one native Settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-adaptive-update: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'adaptive-update',
    order: 85,
    label: () => t('nav'),
  }, AdaptiveUpdateSection))
}

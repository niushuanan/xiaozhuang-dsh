/**
 * Provider-quota plugin, browser half: contributes one session-header action
 * whose popover lists DeepSeek, KIMI, GLM, and the signed-in GPT account.
 * Data arrives over the plugin's same-origin usage route, so the half holds
 * no keys and no state beyond popover visibility and the last snapshot.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { QuotaAction } from './QuotaAction.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { en, NS, zh, type QuotaKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Provider-quota panel copy. */
    'quota': QuotaKey
  }
}

export type { QuotaActionProps } from './QuotaAction.tsx'

/** Required services for locale registration and header-slot contribution. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the header action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-provider-quota: dictionaries')
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'provider-quota',
      // After the background-job list: process state reads before account state.
      order: 30,
      locale: NS,
    }, QuotaAction),
  )
}

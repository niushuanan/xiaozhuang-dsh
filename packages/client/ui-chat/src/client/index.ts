import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ChatAction, type ChatActionInjected } from './ChatAction.tsx'
import { en, zh } from './locales.ts'
import { ChatStarter } from './start-chat.ts'

export { CHAT_AGENT_PRESET, ChatStarter } from './start-chat.ts'
export type { ChatActionInjected, ChatActionProps } from './ChatAction.tsx'

export const inject = ['slots', 'sessions', 'locale']

/** Mount the Start chat sidebar contribution. */
export function apply(ctx: ClientContext): void {
  const starter = new ChatStarter(ctx.sessions)
  ctx.effect(() => ctx.locale.register('chat', { zh, en }), 'ui-chat: dictionaries')
  ctx.slots.inject('sidebar.primary.action', () => ctx.slots.register({
    name: 'sidebar.primary.action',
    id: 'chat',
    order: 10,
    locale: 'chat',
    inject: (): ChatActionInjected => ({ startChat: () => { starter.start() } }),
  }, ChatAction))
}

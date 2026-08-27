/**
 * Conversation outline plugin, browser half. One registration: OutlineRail
 * fills the resident conversation shell's `conversation.session.outline`
 * hole (the additive per-turn rail beside the conversation column). Turn
 * data derives from the standard chat snapshot through the session kit; the
 * component is otherwise self-sufficient. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ui-conversation's SlotMap entry for the outline seat.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { OutlineRail } from './OutlineRail.tsx'
import { en, zh, type OutlineKey } from './locales.ts'

export type { OutlineTurn } from './OutlineRail.tsx'
export type { OutlineKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The conversation outline rail copy. */
    outline: OutlineKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'outline'

/**
 * Required services (cordis fiber inject). The target slot is declared by the
 * ui-conversation apply, whose activation order relative to this one is NOT
 * constrained: dsh.client.inject edges are informational, and the owner
 * provides no waitable service. apply therefore depends on the slot
 * declaration through `slots.inject()` instead of assuming order. `sessions`
 * backs the rail's bounded history paging (the object face's loadOlder).
 */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Register the outline rail once its slot declaration is on the ledger. The
 * inject factory carries one callback: the session object face's loadOlder,
 * which the rail uses to page bounded older history in when the loaded
 * window spans fewer turns than the rail requires.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-outline: dictionaries')
  ctx.slots.inject('conversation.session.outline', () => ctx.slots.register(
    {
      name: 'conversation.session.outline',
      locale: NS,
      inject: sessionId => ({
        loadOlder: () => {
          void ctx.sessions.binding(sessionId)?.session.loadOlder().catch(() => {
            // Paging is best-effort for the rail; a refused page keeps the window as-is.
          })
        },
      }),
    },
    OutlineRail,
  ))
}

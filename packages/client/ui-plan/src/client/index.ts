/**
 * Plan control plugin, browser half: contributes a low-emphasis top-level
 * session status while plan mode is active. The blank Hero and active header
 * each provide a seat so the same action follows the session. Plan mode
 * is entered through the command source; while the projection's effective
 * target is plan mode the status renders and executes /plan off through
 * `command.execute`, otherwise the seat stays empty. Reads ride the generic
 * projection pair through the standard-kit `useProjection`; zero client-side
 * plan state.
 */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the two top-level action seats).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the `plan` SessionProjectionMap merge for useProjection.
import type {} from '@deepseek-ai/dsh-plan-mode/client'
import { PlanModeStatus } from './PlanModeControl.tsx'
import { en, zh, type PlanKey } from './locales.ts'

export type { PlanKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The top-level plan status copy. */
    plan: PlanKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'plan'

/** Injected business face of the top-level plan status. */
export interface PlanModeStatusInjected {
  /**
   * Leave plan mode by executing /plan off.
   * @returns null on admitted execution; a user-visible failure line otherwise.
   */
  exitPlanMode: () => Promise<string | null>
}

/** Required services: the seat's slot registry, commands Remote, and locale registry. */
export const inject = ['slots', 'remote', 'remote.commands', 'locale']

/**
 * Client plugin body: register the active-header and blank-Hero statuses over the command channel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plan: dictionaries')

  const injected = (sessionId: SessionId): PlanModeStatusInjected => ({
    // Failure strings stay English (error-surface policy: not localized).
    exitPlanMode: async () => {
      const result = await ctx.remote.commands.execute(sessionId, '/plan off', [])
      if (!result.ok) return `${result.error.message} (${result.error.code})`
      if (result.value === undefined) return 'unknown command: /plan off'
      return null
    },
  })

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'plan-mode',
    // Static session context follows the agent preset and precedes process actions.
    order: -5,
    locale: NS,
    inject: injected,
  }, PlanModeStatus))

  ctx.slots.inject('conversation.hero.actions', () => ctx.slots.register({
    name: 'conversation.hero.actions',
    id: 'plan-mode',
    order: 0,
    locale: NS,
    inject: injected,
  }, PlanModeStatus))
}

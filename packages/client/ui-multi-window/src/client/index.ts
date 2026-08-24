import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { currentDshWindowContext, DSH_WINDOW_SESSION_PARAM } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { MultiWindowCoordinator } from './coordinator.ts'
import { WindowMenuAction } from './WindowMenuAction.tsx'
import { en, NS, zh, type MultiWindowLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { multiWindow: MultiWindowLocaleKey }
}

export { MultiWindowCoordinator, MAX_DSH_WINDOWS } from './coordinator.ts'
export type { MultiWindowEnvironment, MultiWindowSnapshot, OpenWindowResult } from './coordinator.ts'
export { WindowMenuAction } from './WindowMenuAction.tsx'

export const inject = ['sessions', 'slots', 'locale']

/** Register the menu action, window lease coordinator and auxiliary-session bootstrap. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-multi-window: dictionaries')
  const coordinator = new MultiWindowCoordinator()
  ctx.effect(() => coordinator.start(), 'ui-multi-window: window lease')
  ctx.slots.inject('sidebar.workspaces.sessionMenuAction', () => {
    return ctx.slots.register({
      name: 'sidebar.workspaces.sessionMenuAction',
      id: 'open-in-new-window',
      order: 10,
      locale: NS,
      inject: () => ({ coordinator }),
    }, WindowMenuAction)
  })

  const windowContext = currentDshWindowContext()
  if (windowContext.role !== 'auxiliary') return
  const target = windowContext.sessionId
  let initialTargetOpened = target === undefined
  const synchronize = (): void => {
    const snapshot = ctx.sessions.list.getSnapshot()
    if (!initialTargetOpened && target !== undefined && snapshot.byId[target] !== undefined) {
      initialTargetOpened = true
      ctx.sessions.open(target)
      return
    }
    const current = snapshot.current
    if (current === undefined) return
    const url = new URL(location.href)
    if (url.searchParams.get(DSH_WINDOW_SESSION_PARAM) !== current) {
      url.searchParams.set(DSH_WINDOW_SESSION_PARAM, current)
      history.replaceState(history.state, '', url)
    }
    const title = snapshot.byId[current]?.displayTitle
    if (title !== undefined && title !== '') document.title = `${title} · DeepSeek Harness`
  }
  synchronize()
  ctx.effect(() => ctx.sessions.list.subscribe(synchronize), 'ui-multi-window: auxiliary navigation')
}

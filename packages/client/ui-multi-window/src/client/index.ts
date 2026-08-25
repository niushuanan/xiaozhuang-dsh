import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { currentDshWindowContext, DSH_WINDOW_SESSION_PARAM } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { MultiPaneCoordinator } from './coordinator.ts'
import { SplitPaneWorkspace } from './SplitPaneWorkspace.tsx'
import { WindowMenuAction } from './WindowMenuAction.tsx'
import { en, NS, zh, type MultiWindowLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { multiWindow: MultiWindowLocaleKey }
}

export {
  MAX_DSH_PANES, MAX_DSH_WINDOWS, MultiPaneCoordinator, MultiWindowCoordinator,
} from './coordinator.ts'
export type {
  ConversationPane, MultiPaneEnvironment, MultiPaneSnapshot, MultiWindowEnvironment,
  MultiWindowSnapshot, OpenPaneResult, OpenWindowResult,
} from './coordinator.ts'
export { SplitPaneWorkspace } from './SplitPaneWorkspace.tsx'
export { WindowMenuAction } from './WindowMenuAction.tsx'

export const inject = ['sessions', 'slots', 'locale']

function installAuxiliaryNavigation(ctx: ClientContext): void {
  const windowContext = currentDshWindowContext()
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
  ctx.effect(() => ctx.sessions.list.subscribe(synchronize), 'ui-multi-window: pane navigation')
}

/** Register in-page conversation splitting and compact auxiliary pane boot. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-multi-window: dictionaries')

  if (currentDshWindowContext().role === 'auxiliary') {
    installAuxiliaryNavigation(ctx)
    return
  }

  const coordinator = new MultiPaneCoordinator()
  const synchronize = (): void => {
    const snapshot = ctx.sessions.list.getSnapshot()
    if (snapshot.phase !== 'ready') return
    coordinator.sync(snapshot.current, new Set(Object.keys(snapshot.byId) as SessionId[]))
  }
  synchronize()
  ctx.effect(() => coordinator.start(), 'ui-multi-window: in-page pane coordinator')
  ctx.effect(() => ctx.sessions.list.subscribe(synchronize), 'ui-multi-window: session reconciliation')

  ctx.slots.inject('sidebar.workspaces.sessionMenuAction', () => ctx.slots.register({
    name: 'sidebar.workspaces.sessionMenuAction',
    id: 'open-side-by-side',
    order: 10,
    locale: NS,
    inject: () => ({ coordinator }),
  }, WindowMenuAction))
  ctx.slots.inject('conversation.session.panes', () => ctx.slots.register({
    name: 'conversation.session.panes',
    locale: NS,
    inject: () => ({ coordinator }),
  }, SplitPaneWorkspace))
}

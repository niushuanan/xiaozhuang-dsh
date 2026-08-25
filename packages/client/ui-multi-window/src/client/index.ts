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
  MultiWindowSnapshot, OpenPaneResult, OpenWindowResult, MultiPaneService,
} from './coordinator.ts'
export { SplitPaneWorkspace } from './SplitPaneWorkspace.tsx'
export { WindowMenuAction } from './WindowMenuAction.tsx'

export const inject = ['sessions', 'slots', 'locale']

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Native cross-plugin request to reveal one conversation in this page's split workspace. */
    multiPane: import('./coordinator.ts').MultiPaneService
  }
}

const OPEN_PANE_MESSAGE = 'dsh:multi-pane-open'
const CAN_OPEN_PANE_MESSAGE = 'dsh:multi-pane-can-open'
const OPEN_PANE_REQUEST = 'dsh:multi-pane-open-request'
const PANE_RESPONSE = 'dsh:multi-pane-response'
const PARENT_RESPONSE_TIMEOUT_MS = 2_000

function requestParent<T extends boolean | import('./coordinator.ts').OpenPaneResult>(
  type: typeof CAN_OPEN_PANE_MESSAGE | typeof OPEN_PANE_REQUEST,
  sessionId: SessionId | undefined,
  fallback: T,
  timeoutMs: number,
): Promise<T> {
  const requestId = `${Date.now()}-${Math.random()}`
  return new Promise<T>((resolve) => {
    const finish = (value: T): void => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', receive)
      resolve(value)
    }
    const receive = (event: MessageEvent<unknown>): void => {
      if (event.source !== window.parent || event.origin !== location.origin
        || typeof event.data !== 'object' || event.data === null
        || Reflect.get(event.data, 'type') !== PANE_RESPONSE
        || Reflect.get(event.data, 'requestId') !== requestId) return
      finish(Reflect.get(event.data, 'result') as T)
    }
    const timeout = window.setTimeout(() => { finish(fallback) }, timeoutMs)
    window.addEventListener('message', receive)
    window.parent.postMessage({ type, requestId, ...sessionId === undefined ? {} : { sessionId } }, location.origin)
  })
}

/** Ask the primary page whether an auxiliary selection may open another pane. */
export function requestParentCanOpen(
  sessionId?: SessionId,
  timeoutMs = PARENT_RESPONSE_TIMEOUT_MS,
): Promise<boolean> {
  return requestParent(CAN_OPEN_PANE_MESSAGE, sessionId, false, timeoutMs)
}

function requestParentOpen(
  sessionId: SessionId,
  timeoutMs = PARENT_RESPONSE_TIMEOUT_MS,
): Promise<import('./coordinator.ts').OpenPaneResult> {
  return requestParent(OPEN_PANE_REQUEST, sessionId, 'limit', timeoutMs)
}

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
    ctx.provide('multiPane', {
      canOpenSession: sessionId => requestParentCanOpen(sessionId),
      openSession: sessionId => requestParentOpen(sessionId),
    })
    installAuxiliaryNavigation(ctx)
    return
  }

  const coordinator = new MultiPaneCoordinator()
  ctx.provide('multiPane', coordinator)
  const synchronize = (): void => {
    const snapshot = ctx.sessions.list.getSnapshot()
    if (snapshot.phase !== 'ready') return
    coordinator.sync(snapshot.current, new Set(Object.keys(snapshot.byId) as SessionId[]))
  }
  synchronize()
  ctx.effect(() => coordinator.start(), 'ui-multi-window: in-page pane coordinator')
  ctx.effect(() => {
    const receive = (event: MessageEvent<unknown>): void => {
      if (event.origin !== location.origin || typeof event.data !== 'object' || event.data === null) return
      const type = Reflect.get(event.data, 'type')
      const requestId = Reflect.get(event.data, 'requestId')
      const sessionId = Reflect.get(event.data, 'sessionId')
      if (type === OPEN_PANE_MESSAGE) {
        if (typeof sessionId === 'string' && sessionId !== '') coordinator.openSession(sessionId as SessionId)
        return
      }
      if ((type !== CAN_OPEN_PANE_MESSAGE && type !== OPEN_PANE_REQUEST)
        || typeof requestId !== 'string' || event.source === null) return
      const candidate = typeof sessionId === 'string' && sessionId !== '' ? sessionId as SessionId : undefined
      const result = type === CAN_OPEN_PANE_MESSAGE
        ? coordinator.canOpenSession(candidate)
        : candidate === undefined ? 'limit' : coordinator.openSession(candidate)
      ;(event.source as Window).postMessage({ type: PANE_RESPONSE, requestId, result }, event.origin)
    }
    window.addEventListener('message', receive)
    return () => { window.removeEventListener('message', receive) }
  }, 'ui-multi-window: embedded-pane open requests')
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

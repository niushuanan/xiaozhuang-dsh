import type { SessionId } from '@deepseek-ai/dsh-api-session-controller/client'

/** Query marker carried only by windows created by this plugin. */
export const DSH_WINDOW_ROLE_PARAM = 'dsh-window'
/** Stable identity that isolates navigation and persisted window state. */
export const DSH_WINDOW_ID_PARAM = 'dsh-window-id'
/** Session selected when an auxiliary window first opens. */
export const DSH_WINDOW_SESSION_PARAM = 'dsh-session'
/** Presentation marker for an auxiliary document embedded as a pane. */
export const DSH_WINDOW_EMBED_PARAM = 'dsh-embed'
/** Drag payload shared with native Session rows. */
export const SESSION_DRAG_MIME = 'application/x-dsh-session-id'

const AUXILIARY_ROLE = 'auxiliary'
const CONVERSATION_PANE_EMBED = 'conversation-pane'

export interface DshWindowContext {
  role: 'primary' | 'auxiliary'
  windowId?: string
  sessionId?: SessionId
  embedded?: boolean
}

/** Parse the URL-owned identity used by this plugin's auxiliary documents. */
export function parseDshWindowContext(search: string): DshWindowContext {
  const params = new URLSearchParams(search)
  const windowId = params.get(DSH_WINDOW_ID_PARAM)?.trim()
  if (params.get(DSH_WINDOW_ROLE_PARAM) !== AUXILIARY_ROLE
    || windowId === undefined || windowId === '') return { role: 'primary' }
  const sessionId = params.get(DSH_WINDOW_SESSION_PARAM)?.trim()
  return {
    role: 'auxiliary',
    windowId,
    ...(sessionId === undefined || sessionId === '' ? {} : { sessionId: sessionId as SessionId }),
    ...(params.get(DSH_WINDOW_EMBED_PARAM) === CONVERSATION_PANE_EMBED ? { embedded: true } : {}),
  }
}

/** Current window identity; non-browser runtimes are primary. */
export function currentDshWindowContext(): DshWindowContext {
  return typeof location === 'undefined' ? { role: 'primary' } : parseDshWindowContext(location.search)
}

/** Build the isolated same-origin document used by one conversation pane. */
export function embeddedDshPaneUrl(currentUrl: string, paneId: string, sessionId: SessionId): string {
  const url = new URL(currentUrl)
  url.searchParams.set(DSH_WINDOW_ROLE_PARAM, AUXILIARY_ROLE)
  url.searchParams.set(DSH_WINDOW_ID_PARAM, paneId)
  url.searchParams.set(DSH_WINDOW_SESSION_PARAM, sessionId)
  url.searchParams.set(DSH_WINDOW_EMBED_PARAM, CONVERSATION_PANE_EMBED)
  return url.toString()
}

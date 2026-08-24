/** Browser plugin owning Session export download state and its shared modal. */

import type { ClientContext, ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionLogDownloadController } from './controller.ts'
import { exportConversationImage } from './image-export.ts'
import type { SessionLogDownloadDialogInjected } from './Dialog.tsx'
import { SessionLogDownloadHeaderAction } from './HeaderAction.tsx'
import { en, NS, zh, type SessionLogDownloadKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionLogDownload: SessionLogDownloadController
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-log-download': SessionLogDownloadKey
  }
}

export type { SessionLogDownloadEntry, SessionLogDownloadState } from './controller.ts'

export const inject = ['slots', 'locale', 'sessions']

/**
 * Provide the download controller and mount its modal into the Session Header.
 * @param ctx - browser context carrying slots and locale services.
 */
export function apply(ctx: ClientContext): void {
  const sessions = ctx.get('sessions') as unknown as ISessions
  const controller = new SessionLogDownloadController(
    undefined,
    undefined,
    async (sessionId, signal) => {
      const session = sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error('当前对话尚未加载，请刷新后重试。')
      const title = sessions.list.getSnapshot().byId[sessionId]?.displayTitle
      const blob = await exportConversationImage(session, title ?? '对话记录', signal)
      return title === undefined ? { blob } : { blob, title }
    },
  )
  ctx.provide('sessionLogDownload', controller)
  ctx.effect(() => async () => { await controller.dispose() }, 'session-log-download: browser download lifecycle')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-log-download: browser dictionaries')
  ctx.on('command/executed', (sessionId, commandName, result) => {
    if (commandName === 'export' && result.kind === 'success') void controller.download(sessionId)
  })
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'session-log-download',
    locale: NS,
    inject: (): SessionLogDownloadDialogInjected => ({
      hooks: { sessionLogDownload: controller.store },
      request: (sessionId: SessionId, kind) => controller.download(sessionId, kind),
      dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
    }),
  }, SessionLogDownloadHeaderAction))
}

export type { SessionLogDownloadDialogInjected, SessionLogDownloadDialogProps } from './Dialog.tsx'

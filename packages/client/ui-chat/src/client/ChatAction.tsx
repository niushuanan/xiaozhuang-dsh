import { IconChatOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ChatKey } from './locales.ts'
import css from './ChatAction.module.css'

export interface ChatActionInjected { startChat: () => void }

export type ChatActionProps = PropsRuntime<'sidebar.primary.action'>
  & PropsLocale<'chat'>
  & ChatActionInjected

/** Render the native Start chat action in wide and rail sidebar postures. */
export function ChatAction({ wide, startChat, t }: ChatActionProps) {
  return (
    <Tooltip label={t('start.label')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={`${css.action}${wide ? '' : ` ${css.rail}`}`}
        aria-label={t('start.label')}
        onClick={startChat}
      >
        <IconChatOutline16 size={wide ? 14 : 18} />
        {wide && <span className={css.label}>{t('start')}</span>}
      </button>
    </Tooltip>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { chat: ChatKey }
}

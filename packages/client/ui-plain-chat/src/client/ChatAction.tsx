import { IconNewChatOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './ChatAction.module.css'

export interface ChatActionInjected { startChat: () => void }

export type ChatActionProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'plainChat'>
  & ChatActionInjected

/** Render a wide sidebar row or its compact rail action. */
export function ChatAction({ wide, startChat, t }: ChatActionProps) {
  return (
    <Tooltip label={t('start.label')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={`${css.action}${wide ? ` ${css.wide}` : ` ${css.rail}`}`}
        aria-label={t('start.label')}
        onClick={startChat}
      >
        <IconNewChatOutline16 size={18} />
        {wide && <span className={css.label}>{t('start')}</span>}
      </button>
    </Tooltip>
  )
}

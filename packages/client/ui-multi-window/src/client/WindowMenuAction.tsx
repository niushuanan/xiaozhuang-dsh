import { useSyncExternalStore } from 'react'
import { MenuAction } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-api-session-controller/client'
import type { MultiWindowCoordinator } from './coordinator.ts'
import type { MultiWindowLocaleKey } from './locales.ts'

export interface WindowMenuActionProps {
  sessionId: SessionId
  closeMenu: () => void
  coordinator: MultiWindowCoordinator
  t: (key: MultiWindowLocaleKey) => string
}

function SplitPaneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="2.25" width="5.25" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="2.25" width="5.25" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** Native-looking action that adds one conversation block to the current page. */
export function WindowMenuAction({ sessionId, closeMenu, coordinator, t }: WindowMenuActionProps) {
  const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot)
  const visible = snapshot.currentSessionId === sessionId
    || snapshot.panes.some(pane => pane.sessionId === sessionId)
  return (
    <MenuAction
      icon={<SplitPaneIcon />}
      label={visible ? t('action.visible') : t('action.open')}
      disabled={visible || snapshot.atLimit}
      {...snapshot.atLimit && !visible ? { title: t('action.limit') } : {}}
      onSelect={() => {
        const result = coordinator.openSession(sessionId)
        if (result === 'opened') closeMenu()
      }}
    />
  )
}

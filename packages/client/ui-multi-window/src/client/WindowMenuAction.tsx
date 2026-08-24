import { useState, useSyncExternalStore } from 'react'
import { IconWindowNewOutline16, MenuAction } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { MultiWindowCoordinator } from './coordinator.ts'
import type { MultiWindowLocaleKey } from './locales.ts'

export interface WindowMenuActionProps {
  sessionId: SessionId
  closeMenu: () => void
  coordinator: MultiWindowCoordinator
  t: (key: MultiWindowLocaleKey) => string
}

/** Fourth native-looking session action, present only while the plugin is mounted. */
export function WindowMenuAction({ sessionId, closeMenu, coordinator, t }: WindowMenuActionProps) {
  const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot)
  const [blocked, setBlocked] = useState(false)
  return (
    <MenuAction
      icon={<IconWindowNewOutline16 />}
      label={blocked ? t('action.blocked') : t('action.open')}
      disabled={snapshot.atLimit || blocked}
      {...snapshot.atLimit ? { title: t('action.limit') } : {}}
      onSelect={() => {
        const result = coordinator.openSession(sessionId)
        if (result === 'opened') closeMenu()
        if (result === 'blocked') setBlocked(true)
      }}
    />
  )
}

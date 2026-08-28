/** Persisted viewing state for the settings section navigation. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

type SettingsNavigationState = {
  order: string[]
}

type SettingsNavigationActions = {
  setOrder: (draft: SettingsNavigationState, order: string[]) => void
}

/** Create the browser-local settings-section order store. */
export function createSettingsNavigationStore(): EngineStoreHandle<SettingsNavigationState, SettingsNavigationActions> {
  return defineStore({
    init: (): SettingsNavigationState => ({ order: [] }),
    persist: 'dsh.settings.navigation.v1',
    actions: {
      setOrder: (draft, order: string[]) => { draft.order = order },
    },
  })
}

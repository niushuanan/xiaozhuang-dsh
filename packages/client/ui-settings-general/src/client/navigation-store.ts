/** Persisted viewing state for the settings section navigation. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Browser-local order of section ids. */
type SettingsNavigationState = {
  order: string[]
}

/** Store actions exposed to the settings shell. */
type SettingsNavigationActions = {
  setOrder: (draft: SettingsNavigationState, order: string[]) => void
}

/**
 * Declare the root-scoped navigation order store.
 * @returns the persisted store handle.
 */
export function createSettingsNavigationStore(): EngineStoreHandle<SettingsNavigationState, SettingsNavigationActions> {
  return defineStore({
    init: (): SettingsNavigationState => ({ order: [] }),
    persist: 'dsh.settings.navigation.v1',
    actions: {
      setOrder: (draft, order: string[]) => { draft.order = order },
    },
  })
}

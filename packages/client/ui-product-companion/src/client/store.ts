/** Persisted user choices for the global product companion. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

export type CompanionSkin = 'blue' | 'black'
export type CompanionHabitat = 'sidebar' | 'header' | 'composer' | 'free'

export interface CompanionPosition {
  x: number
  y: number
}

export interface CompanionPreferences {
  skin: CompanionSkin
  position: CompanionPosition | null
  home: CompanionHabitat
  showStatus: boolean
  autoTravel: boolean
}

type CompanionActions = {
  setSkin: (draft: CompanionPreferences, skin: CompanionSkin) => void
  setPosition: (draft: CompanionPreferences, position: CompanionPosition) => void
  setHome: (draft: CompanionPreferences, home: Exclude<CompanionHabitat, 'free'>) => void
  setShowStatus: (draft: CompanionPreferences, enabled: boolean) => void
  setAutoTravel: (draft: CompanionPreferences, enabled: boolean) => void
  resetPosition: (draft: CompanionPreferences) => void
}

/** Declare the root-scoped persisted preference store. */
export function createCompanionStore(): EngineStoreHandle<CompanionPreferences, CompanionActions> {
  return defineStore({
    init: (): CompanionPreferences => ({
      skin: 'blue',
      position: null,
      home: 'sidebar',
      showStatus: true,
      autoTravel: true,
    }),
    persist: 'dsh.product-companion',
    actions: {
      setSkin: (draft, skin: CompanionSkin) => { draft.skin = skin },
      setPosition: (draft, position: CompanionPosition) => {
        draft.position = position
        draft.home = 'free'
      },
      setHome: (draft, home) => {
        draft.home = home
        draft.position = null
      },
      setShowStatus: (draft, enabled) => { draft.showStatus = enabled },
      setAutoTravel: (draft, enabled) => { draft.autoTravel = enabled },
      resetPosition: (draft) => {
        draft.home = 'sidebar'
        draft.position = null
      },
    },
  })
}

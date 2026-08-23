/** Persisted user choices for the global product companion. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

export type CompanionSkin = 'blue' | 'black'

export interface CompanionPosition {
  x: number
  y: number
}

export interface CompanionPreferences {
  skin: CompanionSkin
  position: CompanionPosition | null
}

type CompanionActions = {
  setSkin: (draft: CompanionPreferences, skin: CompanionSkin) => void
  setPosition: (draft: CompanionPreferences, position: CompanionPosition) => void
  resetPosition: (draft: CompanionPreferences) => void
}

/** Declare the root-scoped persisted preference store. */
export function createCompanionStore(): EngineStoreHandle<CompanionPreferences, CompanionActions> {
  return defineStore({
    init: (): CompanionPreferences => ({ skin: 'blue', position: null }),
    persist: 'dsh.product-companion',
    actions: {
      setSkin: (draft, skin: CompanionSkin) => { draft.skin = skin },
      setPosition: (draft, position: CompanionPosition) => { draft.position = position },
      resetPosition: (draft) => { draft.position = null },
    },
  })
}

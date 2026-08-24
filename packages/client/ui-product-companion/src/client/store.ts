/** Persisted user choices for the global product companion. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

export type CompanionSkin = 'blue' | 'black'
export type CompanionSize = 'standard' | 'large'
export type CompanionAction = 'none' | 'focusComposer' | 'switchSide' | 'newSession' | 'menu' | 'close'
export type CompanionHabitat = 'sidebar' | 'header' | 'composer' | 'free'

/** Default product-facing name. Technical plugin ids remain stable. */
export const DEFAULT_COMPANION_NAME = '鲸少女'

export interface CompanionPosition {
  x: number
  y: number
}

export interface CompanionPreferences {
  skin: CompanionSkin
  /** Optional for records persisted before global naming was introduced. */
  displayName?: string
  /** Optional for records persisted before the input-dock redesign. */
  visible?: boolean
  /** Optional for records persisted before size selection was introduced. */
  size?: CompanionSize
  /** Optional gesture bindings preserve compatible defaults for older records. */
  clickAction?: CompanionAction
  doubleClickAction?: CompanionAction
  contextAction?: CompanionAction
  position: CompanionPosition | null
  home: CompanionHabitat
  showStatus: boolean
  autoTravel: boolean
}

type CompanionActions = {
  setDisplayName: (draft: CompanionPreferences, name: string) => void
  setSkin: (draft: CompanionPreferences, skin: CompanionSkin) => void
  setSize: (draft: CompanionPreferences, size: CompanionSize) => void
  setVisible: (draft: CompanionPreferences, visible: boolean) => void
  setClickAction: (draft: CompanionPreferences, action: CompanionAction) => void
  setDoubleClickAction: (draft: CompanionPreferences, action: CompanionAction) => void
  setContextAction: (draft: CompanionPreferences, action: CompanionAction) => void
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
      displayName: DEFAULT_COMPANION_NAME,
      visible: true,
      size: 'large',
      clickAction: 'focusComposer',
      doubleClickAction: 'newSession',
      contextAction: 'menu',
      position: null,
      home: 'sidebar',
      showStatus: true,
      autoTravel: true,
    }),
    persist: 'dsh.product-companion',
    actions: {
      setDisplayName: (draft, name: string) => {
        draft.displayName = name.trim() || DEFAULT_COMPANION_NAME
      },
      setSkin: (draft, skin: CompanionSkin) => { draft.skin = skin },
      setSize: (draft, size: CompanionSize) => { draft.size = size },
      setVisible: (draft, visible: boolean) => { draft.visible = visible },
      setClickAction: (draft, action: CompanionAction) => { draft.clickAction = action },
      setDoubleClickAction: (draft, action: CompanionAction) => { draft.doubleClickAction = action },
      setContextAction: (draft, action: CompanionAction) => { draft.contextAction = action },
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

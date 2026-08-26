/** Persisted user choices for the global product companion. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

export type CompanionSkin = 'blue' | 'black'
export type CompanionSize = 'standard' | 'large'
export type CompanionAction = 'none' | 'focusComposer' | 'voiceInput' | 'switchSide' | 'newSession' | 'menu' | 'close'

/** Default product-facing name. Technical plugin ids remain stable. */
export const DEFAULT_COMPANION_NAME = '鲸少女'
const COMPANION_PERSIST_KEY = 'dsh.product-companion'
const LEGACY_AI_VOICE_KEYS = [
  'voiceProcessing', 'voiceProvider', 'voiceModel', 'voiceInstruction', 'voiceStats',
] as const

/** Remove retired AI voice settings without disturbing the user's companion choices. */
function removeLegacyAiVoicePreferences(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(COMPANION_PERSIST_KEY)
    if (raw === null) return
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return
    const preferences = parsed as Record<string, unknown>
    const cleaned = Object.fromEntries(
      Object.entries(preferences).filter(([key]) => !LEGACY_AI_VOICE_KEYS.includes(key as typeof LEGACY_AI_VOICE_KEYS[number])),
    )
    if (Object.keys(cleaned).length !== Object.keys(preferences).length) {
      localStorage.setItem(COMPANION_PERSIST_KEY, JSON.stringify(cleaned))
    }
  } catch {
    // Persistence failures remain non-fatal, matching the runtime store contract.
  }
}

/** Read the saved product name before the slot-owned store first renders. */
export function persistedCompanionName(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_COMPANION_NAME
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPANION_PERSIST_KEY) ?? 'null') as unknown
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_COMPANION_NAME
    const displayName = (parsed as { displayName?: unknown }).displayName
    return typeof displayName === 'string' && displayName.trim().length > 0
      ? displayName.trim()
      : DEFAULT_COMPANION_NAME
  } catch {
    return DEFAULT_COMPANION_NAME
  }
}

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
  /** Horizontal berth on the composer card as a 0–1 ratio; absent keeps the default right berth. */
  composerOffsetRatio?: number
  showStatus: boolean
  autoTravel: boolean
  /** Voice is a companion capability and disappears with this native plugin. */
  voiceEnabled?: boolean
  voiceShortcut?: string
}

type CompanionActions = {
  setDisplayName: (draft: CompanionPreferences, name: string) => void
  setSkin: (draft: CompanionPreferences, skin: CompanionSkin) => void
  setSize: (draft: CompanionPreferences, size: CompanionSize) => void
  setVisible: (draft: CompanionPreferences, visible: boolean) => void
  setClickAction: (draft: CompanionPreferences, action: CompanionAction) => void
  setDoubleClickAction: (draft: CompanionPreferences, action: CompanionAction) => void
  setContextAction: (draft: CompanionPreferences, action: CompanionAction) => void
  setComposerOffsetRatio: (draft: CompanionPreferences, ratio: number) => void
  setShowStatus: (draft: CompanionPreferences, enabled: boolean) => void
  setAutoTravel: (draft: CompanionPreferences, enabled: boolean) => void
  setVoiceEnabled: (draft: CompanionPreferences, enabled: boolean) => void
  setVoiceShortcut: (draft: CompanionPreferences, shortcut: string) => void
}

export const DEFAULT_VOICE_SHORTCUT = 'Alt+Space'

/** Declare the root-scoped persisted preference store. */
export function createCompanionStore(): EngineStoreHandle<CompanionPreferences, CompanionActions> {
  removeLegacyAiVoicePreferences()
  return defineStore({
    init: (): CompanionPreferences => ({
      skin: 'blue',
      displayName: DEFAULT_COMPANION_NAME,
      visible: true,
      size: 'large',
      clickAction: 'focusComposer',
      doubleClickAction: 'newSession',
      contextAction: 'menu',
      showStatus: true,
      autoTravel: true,
      voiceEnabled: true,
      voiceShortcut: DEFAULT_VOICE_SHORTCUT,
    }),
    persist: COMPANION_PERSIST_KEY,
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
      setComposerOffsetRatio: (draft, ratio: number) => {
        draft.composerOffsetRatio = Math.max(0, Math.min(1, ratio))
      },
      setShowStatus: (draft, enabled) => { draft.showStatus = enabled },
      setAutoTravel: (draft, enabled) => { draft.autoTravel = enabled },
      setVoiceEnabled: (draft, enabled) => { draft.voiceEnabled = enabled },
      setVoiceShortcut: (draft, shortcut) => {
        draft.voiceShortcut = shortcut || DEFAULT_VOICE_SHORTCUT
      },
    },
  })
}

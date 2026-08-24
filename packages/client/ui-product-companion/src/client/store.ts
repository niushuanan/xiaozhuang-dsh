/** Persisted user choices for the global product companion. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

export type CompanionSkin = 'blue' | 'black'
export type CompanionSize = 'standard' | 'large'
export type CompanionAction = 'none' | 'focusComposer' | 'voiceInput' | 'switchSide' | 'newSession' | 'menu' | 'close'
export type CompanionHabitat = 'sidebar' | 'header' | 'composer' | 'free'

export interface VoiceUsageStats {
  sessions: number
  spokenSeconds: number
  processedChars: number
  estimatedSavedSeconds: number
}

/** Default product-facing name. Technical plugin ids remain stable. */
export const DEFAULT_COMPANION_NAME = '鲸少女'
const COMPANION_PERSIST_KEY = 'dsh.product-companion'

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
  position: CompanionPosition | null
  home: CompanionHabitat
  showStatus: boolean
  autoTravel: boolean
  /** Voice is a companion capability and disappears with this native plugin. */
  voiceEnabled?: boolean
  voiceProcessing?: boolean
  voiceProvider?: string
  voiceModel?: string
  voiceInstruction?: string
  voiceShortcut?: string
  voiceStats?: VoiceUsageStats
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
  setVoiceEnabled: (draft: CompanionPreferences, enabled: boolean) => void
  setVoiceProcessing: (draft: CompanionPreferences, enabled: boolean) => void
  setVoiceModel: (draft: CompanionPreferences, provider: string, model: string) => void
  setVoiceInstruction: (draft: CompanionPreferences, instruction: string) => void
  setVoiceShortcut: (draft: CompanionPreferences, shortcut: string) => void
  recordVoiceUsage: (
    draft: CompanionPreferences,
    spokenSeconds: number,
    processedChars: number,
    estimatedSavedSeconds: number,
  ) => void
  resetVoiceStats: (draft: CompanionPreferences) => void
}

export const DEFAULT_VOICE_INSTRUCTION = '整理口语停顿、重复和明显识别错误，补全自然标点；保持原意与原语言，不擅自扩写。'
export const DEFAULT_VOICE_SHORTCUT = 'Alt+Space'

function emptyVoiceStats(): VoiceUsageStats {
  return { sessions: 0, spokenSeconds: 0, processedChars: 0, estimatedSavedSeconds: 0 }
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
      voiceEnabled: true,
      voiceProcessing: true,
      voiceProvider: '',
      voiceModel: '',
      voiceInstruction: DEFAULT_VOICE_INSTRUCTION,
      voiceShortcut: DEFAULT_VOICE_SHORTCUT,
      voiceStats: emptyVoiceStats(),
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
      setVoiceEnabled: (draft, enabled) => { draft.voiceEnabled = enabled },
      setVoiceProcessing: (draft, enabled) => { draft.voiceProcessing = enabled },
      setVoiceModel: (draft, provider, model) => {
        draft.voiceProvider = provider
        draft.voiceModel = model
      },
      setVoiceInstruction: (draft, instruction) => {
        draft.voiceInstruction = instruction.trim() || DEFAULT_VOICE_INSTRUCTION
      },
      setVoiceShortcut: (draft, shortcut) => {
        draft.voiceShortcut = shortcut || DEFAULT_VOICE_SHORTCUT
      },
      recordVoiceUsage: (draft, spokenSeconds, processedChars, estimatedSavedSeconds) => {
        const stats = draft.voiceStats ?? emptyVoiceStats()
        stats.sessions += 1
        stats.spokenSeconds += Math.max(0, Math.round(spokenSeconds))
        stats.processedChars += Math.max(0, Math.round(processedChars))
        stats.estimatedSavedSeconds += Math.max(0, Math.round(estimatedSavedSeconds))
        draft.voiceStats = stats
      },
      resetVoiceStats: (draft) => { draft.voiceStats = emptyVoiceStats() },
    },
  })
}

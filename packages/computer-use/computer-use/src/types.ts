import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** Browser execution selected by `/browser`. */
export type BrowserMode = 'isolated' | 'connected'

/** Durable plugin preferences exposed by the Computer Use Settings page. */
export interface ComputerUseConfig {
  /** Whether `/computer` may activate Qwen desktop controls. */
  desktopEnabled: boolean
  /** Whether `/browser` and the conversation browser workspace may act. */
  browserEnabled: boolean
  /** Browser provider used when `/browser` omits an explicit mode. */
  defaultBrowserMode: BrowserMode
  /** Whether the connected Chrome provider creates a task-owned tab by default. */
  connectedBrowserNewTab: boolean
}

/** One native action result shared by desktop and browser tools. */
export interface ComputerUseResult {
  provider: 'qwen-open-computer-use' | 'playwright' | 'dsh-browser-bridge'
  text: string
  screenshot?: ImageAttachmentRef
}

/** Live, loopback-only status consumed by the Settings page. */
export interface ComputerUseStatus {
  desktop: {
    installed: boolean
    accessibility: 'granted' | 'missing' | 'unknown'
    screenRecording: 'granted' | 'missing' | 'unknown'
  }
  isolatedBrowser: {
    available: boolean
  }
  connectedBrowser: {
    connected: boolean
    browser?: string
    version?: string
    extensionPath: string
    pairingCode: string
  }
}

/** Serializable browser action result before model projection. */
export interface BrowserActionResult {
  text: string
  screenshot?: Buffer
  tabs?: readonly BrowserWorkspaceTab[]
}

/** One real provider page exposed as a compact workspace tab. */
export interface BrowserWorkspaceTab {
  id: string
  title: string
  url: string
  active: boolean
  closable: boolean
}

/** One recent action displayed in the conversation-side browser workspace. */
export interface BrowserWorkspaceStep {
  id: string
  action: string
  detail: string
  status: 'running' | 'complete' | 'error'
  startedAt: number
  finishedAt?: number
}

/** Loopback projection of one session's live browser surface. */
export interface BrowserWorkspaceState {
  sessionId: string
  mode: BrowserMode
  active: boolean
  paused: boolean
  running: boolean
  action?: string
  title?: string
  url?: string
  text: string
  hasScreenshot: boolean
  screenshotVersion: number
  updatedAt: number
  tabs: readonly BrowserWorkspaceTab[]
  steps: readonly BrowserWorkspaceStep[]
}

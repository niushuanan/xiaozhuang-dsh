// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  BrowserWorkspace, BrowserWorkspaceTrigger, type BrowserWorkspaceState,
} from '../src/client/BrowserWorkspace.tsx'
import type { ComputerUsePreferences } from '../src/client/ComputerUseSettings.tsx'
import { zh } from '../src/client/locales.ts'
import { workspaceUi } from '../src/client/workspace-store.ts'

const state: BrowserWorkspaceState = {
  sessionId: 'session-ui',
  mode: 'isolated',
  active: true,
  paused: false,
  running: false,
  title: 'First page',
  url: 'https://example.com',
  text: 'First page\nhttps://example.com',
  hasScreenshot: false,
  screenshotVersion: 1,
  updatedAt: Date.now(),
  tabs: [
    { id: 'one', title: 'First page', url: 'https://example.com', active: true, closable: false },
  ],
  steps: [],
}

function settings(): SettingsScope<ComputerUsePreferences> {
  const value: ComputerUsePreferences = {
    desktopEnabled: true,
    browserEnabled: true,
    defaultBrowserMode: 'isolated',
    connectedBrowserNewTab: true,
  }
  const snapshot = { status: 'ready' as const, value, base: value, user: {}, revision: 1, writable: true, mode: 'host' as const }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    mutate: () => Promise.resolve(),
    set: () => Promise.resolve(),
    unset: () => Promise.resolve(),
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  cleanup()
  workspaceUi.close('session-ui')
})

describe('BrowserWorkspace', () => {
  it('does not probe native permissions while the workspace is closed', async () => {
    workspaceUi.close('session-ui')
    const status = vi.fn(async () => ({
      desktop: { installed: true, accessibility: 'granted' as const, screenRecording: 'granted' as const },
      isolatedBrowser: { available: true },
      connectedBrowser: { connected: false, extensionPath: '', pairingCode: '' },
    }))
    render(<BrowserWorkspace {...({
      sessionId: 'session-ui',
      settings: settings(),
      status,
      workspace: async () => ({ enabled: true }),
      act: vi.fn(),
      screenshotUrl: () => '/screenshot.png',
      t: (key: keyof typeof zh) => zh[key],
    } as unknown as Parameters<typeof BrowserWorkspace>[0])} />)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(status).not.toHaveBeenCalled()
  })

  it('reuses the generated computer glyph in the browser workspace trigger', () => {
    render(<BrowserWorkspaceTrigger {...({
      sessionId: 'session-ui',
      t: (key: keyof typeof zh) => zh[key],
    } as unknown as Parameters<typeof BrowserWorkspaceTrigger>[0])} />)
    const trigger = screen.getByRole('button', { name: 'Computer Use' })
    expect(trigger.querySelector('[data-computer-use-icon="true"]')).not.toBeNull()
    expect(trigger.querySelector('svg')).toBeNull()
    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('tooltip').getAttribute('data-side')).toBe('bottom')
  })

  it('renders a search-like omnibox and creates a real provider page', async () => {
    const act = vi.fn(async () => ({
      ...state,
      title: '新标签页',
      url: 'about:blank',
      tabs: [
        { ...state.tabs[0]!, closable: true },
        { id: 'two', title: '新标签页', url: 'about:blank', active: true, closable: true },
      ],
    }))
    workspaceUi.open('session-ui')
    render(<BrowserWorkspace {...({
      sessionId: 'session-ui',
      settings: settings(),
      status: async () => ({
        desktop: { installed: true, accessibility: 'granted', screenRecording: 'granted' },
        isolatedBrowser: { available: true },
        connectedBrowser: { connected: false, extensionPath: '', pairingCode: '' },
      }),
      workspace: async () => ({ enabled: true, state }),
      act,
      screenshotUrl: () => '/screenshot.png',
      t: (key: keyof typeof zh, values?: Record<string, unknown>) => (
        key === 'workspaceStepCount'
          ? zh[key].replace('{count}', String(values?.count ?? 0))
          : key === 'workspaceClosePage'
            ? zh[key].replace('{title}', String(values?.title ?? ''))
            : zh[key]
      ),
    } as unknown as Parameters<typeof BrowserWorkspace>[0])} />)

    expect((await screen.findByRole('textbox', { name: '搜索或输入网址' })).getAttribute('placeholder')).toBe('搜索网页或输入网址')
    const expand = screen.getByRole('button', { name: '展开工作区' })
    fireEvent.pointerLeave(expand.closest('header')!)
    fireEvent.focus(expand)
    expect(screen.getByText('展开工作区').getAttribute('data-side')).toBe('bottom')
    fireEvent.blur(expand)
    fireEvent.focus(screen.getByRole('button', { name: '关闭工作区' }))
    expect(screen.getByText('关闭工作区').getAttribute('data-side')).toBe('bottom')
    fireEvent.click(screen.getByRole('button', { name: 'Computer Use 设置' }))
    const settingsMenu = screen.getByRole('group', { name: 'Computer Use 设置' })
    expect(settingsMenu.textContent).toBe('桌面控制浏览器控制')
    expect(screen.queryByText('授权完成 · 已连接')).toBeNull()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '打开新页面' }))
    await waitFor(() => { expect(act).toHaveBeenCalledWith(expect.objectContaining({ action: 'new_tab' })) })
  })
})

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  ComputerUseSettings,
  type ComputerUsePreferences,
  type ComputerUseSettingsProps,
} from '../src/client/ComputerUseSettings.tsx'
import { zh } from '../src/client/locales.ts'

const value: ComputerUsePreferences = {
  desktopEnabled: true,
  browserEnabled: true,
  defaultBrowserMode: 'isolated',
  connectedBrowserNewTab: true,
}

function settings(): SettingsScope<ComputerUsePreferences> {
  const snapshot = { status: 'ready' as const, value, base: value, user: {}, revision: 1, writable: true, mode: 'host' as const }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    mutate: () => Promise.resolve(),
    set: () => Promise.resolve(),
    unset: () => Promise.resolve(),
  }
}

describe('ComputerUseSettings', () => {
  it('renders the native capabilities and browser-source controls', async () => {
    const props = {
      settings: settings(),
      status: () => Promise.resolve({
        desktop: { installed: true, accessibility: 'granted', screenRecording: 'granted' },
        isolatedBrowser: { available: true },
        connectedBrowser: {
          connected: false,
          extensionPath: '/tmp/dsh-extension',
          pairingCode: 'ws://127.0.0.1:3080/computer-use/bridge#token',
        },
      }),
      setupDesktop: () => Promise.resolve(),
      openExtension: () => Promise.resolve(),
      t: ((key: keyof typeof zh) => zh[key]),
      close: () => {},
    } as unknown as ComputerUseSettingsProps
    render(<ComputerUseSettings {...props} />)
    const desktopControl = await screen.findByText('桌面控制')
    const browserControl = screen.getByText('浏览器控制')
    expect(desktopControl).toBeDefined()
    expect(browserControl).toBeDefined()
    expect(desktopControl.parentElement?.parentElement?.querySelector('svg')).toBeNull()
    expect(browserControl.parentElement?.parentElement?.querySelector('svg')).toBeNull()
    expect(screen.getByText('浏览器来源')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Chrome' })).toBeDefined()
    expect(screen.getByText('Chrome 连接')).toBeDefined()
  })
})

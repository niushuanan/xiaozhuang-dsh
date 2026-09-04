// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SideCardSection } from '../src/client/SideCardSection.tsx'
import { api } from '../src/client/api.ts'
import { attachLocale } from '../src/client/locales.ts'
import { createBetterSidebarService } from '../src/client/service.ts'
import { createSidebarStore } from '../src/client/state.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  attachLocale(undefined)
  localStorage.clear()
})

function renderSection() {
  attachLocale({ getSnapshot: () => ({ active: 'zh' }) })
  const store = createSidebarStore()
  const service = createBetterSidebarService(store)
  service.registerTab({ id: 'git', title: '源代码管理', component: () => null })
  service.registerFileViewer({
    id: 'image', title: '图片', exts: ['png'], fetchStrategy: 'mediaUrl', component: () => null,
  })
  vi.spyOn(api, 'settingsGet').mockResolvedValue({ value: store.getPrefs(), revision: 1 })
  vi.spyOn(api, 'settingsUpdate').mockImplementation(async patch => ({
    value: { ...store.getPrefs(), ...patch },
    revision: 2,
  }))
  return render(
    <SideCardSection
      store={store}
      service={service}
      close={() => {}}
      setLabel={() => {}}
      useSessions={() => { throw new Error('unused') }}
      useSessionPendingInteraction={() => { throw new Error('unused') }}
      useWorkspaces={() => { throw new Error('unused') }}
    />,
  )
}

describe('SideCardSection native settings chrome', () => {
  it('uses the product title and plain semantic sections without package identity', () => {
    renderSection()

    expect(screen.getByRole('heading', { level: 2, name: '侧边卡片' })).toBeTruthy()
    expect(screen.getByText('管理侧边卡片的显示内容与默认行为')).toBeTruthy()
    expect(screen.queryByText('DSH-better-sidebar')).toBeNull()
    expect(screen.queryByText('v0.17.0')).toBeNull()
    expect(screen.getByRole('region', { name: '常规' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '侧边栏内容' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '文件预览' })).toBeTruthy()
  })

  it('keeps every enable control exposed as an accessible switch', () => {
    renderSection()

    expect(screen.getByRole('switch', { name: '新会话默认打开' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: '源代码管理' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: '图片' })).toBeTruthy()
  })

  it('uses the borderless neutral off-switch recipe', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'plugins/better-sidebar/src/client/SideCardSection.module.css',
    ), 'utf8')
    const track = source.match(/\.switchTrack\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? ''
    const thumb = source.match(/\.switchThumb\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? ''

    expect(track).toContain('border: 0')
    expect(track).toContain('color-mix')
    expect(thumb).toContain('width: 16px')
    expect(thumb).toContain('height: 16px')
    expect(thumb).toContain('var(--dsw-alias-bg-layer-1)')
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Context } from '../src/context-types.ts'
import { BrowserView } from '../src/client/BrowserView.tsx'
import { api } from '../src/client/api.ts'
import { attachLocale } from '../src/client/locales.ts'
import type { SessionScope } from '../src/client/api.ts'
import { createSidebarStore } from '../src/client/state.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  attachLocale(undefined)
  localStorage.clear()
})

function renderBrowser(defaultMode: 'url' | 'search') {
  attachLocale({ getSnapshot: () => ({ active: 'zh' }) })
  const store = createSidebarStore()
  store.setPrefs({ ...store.getPrefs(), browserDefaultMode: defaultMode })
  vi.spyOn(api, 'browserProbe').mockResolvedValue({ reachable: true, status: 200 })
  return render(
    <BrowserView
      ctx={{} as Context}
      store={store}
      scope={{ sessionId: 's1', cwd: '/tmp' } satisfies SessionScope}
      tab={{ id: 'browser:1', type: 'browser', title: '浏览器' }}
      visible
    />,
  )
}

describe('BrowserView input modes', () => {
  it('starts new tabs in the configured direct-search mode and submits a real result URL', async () => {
    const { container } = renderBrowser('search')

    const input = screen.getByRole('textbox', { name: '输入搜索内容' })
    expect(screen.getByRole('button', { name: '输入模式：直接搜索' })).toBeTruthy()
    fireEvent.change(input, { target: { value: 'DeepSeek Harness' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(container.querySelector('iframe')?.getAttribute('src'))
        .toBe('https://www.bing.com/search?q=DeepSeek%20Harness')
    })
    expect((input as HTMLInputElement).value).toBe('DeepSeek Harness')
  })

  it('lets the user switch the same field from direct search to URL mode', () => {
    renderBrowser('search')

    fireEvent.click(screen.getByRole('button', { name: '输入模式：直接搜索' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '网址' }))

    expect(screen.getByRole('textbox', { name: '输入网址，例如 example.com' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '输入模式：网址' })).toBeTruthy()
  })
})

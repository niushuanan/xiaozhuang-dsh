/**
 * Client render test for the read-only model-terminal mirror view. Pins the
 * user-visible contract: a static read-only hint (no input surface — the model
 * owns the send seam), a status line derived from the polled read result, and
 * the tail text rendered from `agent-terminal.read`. The `fetch` seam is
 * stubbed at the global (the api module calls `fetch` directly).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { AgentTerminalView } from '../src/client/AgentTerminalView.tsx'
import type { Context } from '../src/context-types.ts'
import type { SidebarStore } from '../src/client/state.ts'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

interface ReadValue {
  text: string
  totalLines: number
  lineBegin: number
  lineEnd: number
  truncated: boolean
  exited: boolean
  exitCode?: number | null
  exitSignal?: string | null
}

function render(): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const ctx = { get: () => undefined } as unknown as Context
  const store = {} as unknown as SidebarStore
  const root: Root = createRoot(container)
  act(() => {
    root.render(createElement(AgentTerminalView, {
      ctx,
      store,
      scope: { sessionId: 'sess-a' },
      tab: { id: 'agent-terminal:pty-1', title: 'main' },
      visible: true,
    }))
  })
  return {
    container,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

const fetchMock = vi.fn()

function stubFetch(value: ReadValue): void {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, value }),
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** Flush the first poll (the fetch mock resolves in a microtask). */
async function settle(): Promise<void> {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AgentTerminalView', () => {
  it('renders the read-only hint and the polled tail output with a running status', async () => {
    const value: ReadValue = { text: 'hello\nworld\n', totalLines: 2, lineBegin: 0, lineEnd: 2, truncated: false, exited: false }
    stubFetch(value)
    const { container, unmount } = render()
    try {
      await settle()
      // The input area is a read-only hint — there is no textarea/input surface.
      expect(container.querySelector('textarea, input')).toBeNull()
      expect(container.textContent).toContain('read-only')
      expect(container.textContent).toContain('hello')
      expect(container.textContent).toContain('running')
    } finally {
      unmount()
    }
  })

  it('shows the exited status with the exit code', async () => {
    const value: ReadValue = { text: 'done\n', totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: false, exited: true, exitCode: 3, exitSignal: null }
    stubFetch(value)
    const { container, unmount } = render()
    try {
      await settle()
      expect(container.textContent).toContain('exited')
      expect(container.textContent).toContain('3')
    } finally {
      unmount()
    }
  })
})

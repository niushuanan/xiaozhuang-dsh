// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-session-controller/client'
import type { MultiWindowCoordinator } from '../src/client/coordinator.ts'
import { WindowMenuAction } from '../src/client/WindowMenuAction.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

function coordinator(atLimit = false) {
  const snapshot = { panes: [], currentSessionId: 'session-1' as SessionId, count: atLimit ? 4 : 1, atLimit }
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    openSession: vi.fn(() => 'opened' as const),
  } as unknown as MultiWindowCoordinator
}

describe('WindowMenuAction', () => {
  it('opens the selected session and closes its owner menu', () => {
    const target = coordinator()
    const closeMenu = vi.fn()
    render(<WindowMenuAction
      sessionId={'session-2' as SessionId}
      closeMenu={closeMenu}
      coordinator={target}
      t={key => zh[key]}
    />)
    fireEvent.click(screen.getByRole('menuitem', { name: '并排打开' }))
    expect(target.openSession).toHaveBeenCalledWith('session-2')
    expect(closeMenu).toHaveBeenCalledOnce()
  })

  it('disables the action when four windows are already active', () => {
    render(<WindowMenuAction
      sessionId={'session-4' as SessionId}
      closeMenu={vi.fn()}
      coordinator={coordinator(true)}
      t={key => zh[key]}
    />)
    const action = screen.getByRole<HTMLButtonElement>('menuitem', { name: '并排打开' })
    expect(action.disabled).toBe(true)
    expect(action.title).toBe('当前页面最多并排 4 个对话')
  })
})

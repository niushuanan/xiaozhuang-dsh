// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelectionActions } from '../src/client/SelectionActions.tsx'
import { sourceMarkerPosition } from '../src/client/SelectionSourceMarker.tsx'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const packet = {
  selectedText: '核心功能', context: '上下文', sessionId: 's1', cwd: '/work/dsh', sourceType: 'dsh' as const,
  messageRole: 'assistant' as const, messageSeq: 8,
  rect: { left: 80, top: 100, bottom: 120, width: 120 },
}

describe('SelectionActions', () => {
  it('only positions a source marker beside source content that is visible', () => {
    expect(sourceMarkerPosition({ right: 1000, top: 200, bottom: 260 }, 1, { width: 1200, height: 800 }))
      .toEqual({ left: 1008, top: 208 })
    expect(sourceMarkerPosition({ right: 1000, top: -100, bottom: -10 }, 1, { width: 1200, height: 800 }))
      .toBeUndefined()
    expect(sourceMarkerPosition({ right: 1000, top: 810, bottom: 900 }, 1, { width: 1200, height: 800 }))
      .toBeUndefined()
  })

  it('routes the three horizontal actions to current quote, memory, and side chat', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    const quote = vi.fn(async () => ({
      packet,
      occurrenceId: 1,
      getSnapshot: () => true,
      subscribe: () => () => {},
    }))
    const sideChat = vi.fn(async () => 'opened' as const)
    const remember = vi.fn(async () => ({ summary: '已记忆', revision: 'r1' }))
    const Component = SelectionActions as ComponentType<Record<string, unknown>>
    render(<Component
      capture={() => packet}
      quote={quote}
      sideChat={sideChat}
      remember={remember}
      undo={vi.fn()}
      t={(key: string) => key}
    />)

    fireEvent.pointerUp(document)
    const toolbar = await screen.findByRole('toolbar')
    expect(toolbar.style.top).toBe('56px')
    expect(Array.from(toolbar.querySelectorAll('button')).map(button => button.textContent)).toEqual([
      'quote', 'memory', 'sideChat',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'quote' }))
    await waitFor(() => expect(quote).toHaveBeenCalledWith(packet))

    fireEvent.pointerUp(document)
    fireEvent.click(await screen.findByRole('button', { name: 'sideChat' }))
    await waitFor(() => expect(sideChat).toHaveBeenCalledWith(packet))
  })

  it('does not offer undo when AI decides the selected memory needs no document change', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    const Component = SelectionActions as ComponentType<Record<string, unknown>>
    render(<Component
      capture={() => packet}
      quote={vi.fn()}
      sideChat={vi.fn()}
      remember={vi.fn(async () => ({ summary: '现有记忆已经覆盖', changed: false, revision: 'same' }))}
      undo={vi.fn()}
      t={(key: string) => key}
    />)

    fireEvent.pointerUp(document)
    fireEvent.click(await screen.findByRole('button', { name: 'memory' }))
    expect(await screen.findByText('现有记忆已经覆盖')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'undo' })).toBeNull()
  })

  it('renumbers remaining source annotations after an earlier quote is removed', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    let currentPacket = packet
    const active = [true, true]
    const listeners = [new Set<() => void>(), new Set<() => void>()]
    let next = 0
    const quote = vi.fn(async (selected: typeof packet) => {
      const index = next++
      return {
        packet: selected,
        occurrenceId: index + 1,
        getSnapshot: () => active[index] ?? false,
        subscribe: (listener: () => void) => {
          listeners[index]?.add(listener)
          return () => { listeners[index]?.delete(listener) }
        },
      }
    })
    const Component = SelectionActions as ComponentType<Record<string, unknown>>
    const view = render(<>
      <div data-dsh-message data-dsh-message-role="assistant" data-dsh-message-seq="8" />
      <div data-dsh-message data-dsh-message-role="assistant" data-dsh-message-seq="9" />
      <Component
        capture={() => currentPacket}
        quote={quote}
        sideChat={vi.fn()}
        remember={vi.fn()}
        undo={vi.fn()}
        t={(key: string) => key}
      />
    </>)
    for (const source of view.container.querySelectorAll<HTMLElement>('[data-dsh-message]')) {
      source.getBoundingClientRect = () => ({ right: 600, top: 100, bottom: 140 }) as DOMRect
    }

    fireEvent.pointerUp(document)
    fireEvent.click(await screen.findByRole('button', { name: 'quote' }))
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull())
    currentPacket = { ...packet, selectedText: '第二段', messageSeq: 9 }
    fireEvent.pointerUp(document)
    fireEvent.click(await screen.findByRole('button', { name: 'quote' }))
    expect(await screen.findByLabelText('引用 2')).toBeTruthy()

    active[0] = false
    for (const listener of listeners[0] ?? []) listener()
    await waitFor(() => {
      expect(screen.queryByLabelText('引用 2')).toBeNull()
      expect(screen.getByLabelText('引用 1').textContent).toContain('第二段')
    })
  })
})

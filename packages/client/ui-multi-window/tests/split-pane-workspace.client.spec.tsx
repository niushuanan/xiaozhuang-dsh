// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SESSION_DRAG_MIME, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { MultiPaneCoordinator } from '../src/client/coordinator.ts'
import {
  resizeAdjacentPanes,
  SplitPaneWorkspace,
  type SplitPaneWorkspaceProps,
} from '../src/client/SplitPaneWorkspace.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const id = (value: string) => value as SessionId

describe('SplitPaneWorkspace', () => {
  it('opens a dragged directory conversation as a second pane from the whole conversation surface', () => {
    const values = new Map<string, string>()
    const coordinator = new MultiPaneCoordinator({
      storage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value) },
      },
      randomId: () => 'pane-drop',
      setSplitActive: () => {},
    })
    coordinator.sync(id('session-1'), new Set([id('session-1'), id('session-2')]))
    const sessionState = {
      current: id('session-1'),
      byId: {
        [id('session-1')]: { displayTitle: '主对话' },
        [id('session-2')]: { displayTitle: '拖入的对话' },
      },
    }
    const props = {
      coordinator,
      t: (key: keyof typeof zh) => zh[key],
      useSessions: (selector: (state: typeof sessionState) => unknown) => selector(sessionState),
    } as unknown as SplitPaneWorkspaceProps
    const transfer = {
      types: [SESSION_DRAG_MIME],
      effectAllowed: 'copyMove',
      dropEffect: 'none',
      getData: (type: string) => type === SESSION_DRAG_MIME ? 'session-2' : '',
    }

    const view = render(
      <div data-testid="conversation-frame">
        <div data-slot=""><SplitPaneWorkspace {...props} /></div>
      </div>,
    )
    // Slot plugins can mount before the conversation skeleton. The drop surface
    // must still bind once the real conversation area appears beside the slot.
    view.rerender(
      <div data-testid="conversation-frame">
        <div data-slot=""><SplitPaneWorkspace {...props} /></div>
        <div data-testid="conversation-scroll" data-conversation-scroll="" />
      </div>,
    )
    const dropTarget = screen.getByTestId('conversation-scroll')
    fireEvent.dragEnter(dropTarget, { dataTransfer: transfer })
    expect(screen.getByText('松开以并排打开')).toBeTruthy()
    fireEvent.dragOver(dropTarget, { dataTransfer: transfer })
    expect(transfer.dropEffect).toBe('copy')
    fireEvent.drop(dropTarget, { dataTransfer: transfer })
    expect(coordinator.getSnapshot().panes).toEqual([
      { paneId: 'pane-drop', sessionId: id('session-2') },
    ])
    expect(view.getByTitle('拖入的对话')).toBeTruthy()
  })

  it('resizes only the panes touching a separator and preserves the total width', () => {
    const resized = resizeAdjacentPanes([0.25, 0.25, 0.25, 0.25], 1, 100, 1000)

    expect(resized[0]).toBe(0.25)
    expect(resized[1]).toBeCloseTo(0.35)
    expect(resized[2]).toBeCloseTo(0.15)
    expect(resized[3]).toBe(0.25)
    expect(resized.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
  })

  it('keeps a usable floor when a four-pane workspace is narrow', () => {
    const resized = resizeAdjacentPanes([0.25, 0.25, 0.25, 0.25], 0, -300, 800)

    expect(resized[0]).toBeCloseTo(0.15)
    expect(resized[1]).toBeCloseTo(0.35)
    expect(resized[2]).toBe(0.25)
    expect(resized[3]).toBe(0.25)
  })

  it('renders an isolated compact DSH document and closes only that pane', () => {
    const values = new Map<string, string>()
    const coordinator = new MultiPaneCoordinator({
      storage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value) },
      },
      randomId: () => 'pane-2',
      setSplitActive: () => {},
    })
    coordinator.sync(id('session-1'), new Set([id('session-1'), id('session-2')]))
    coordinator.openSession(id('session-2'))
    const sessionState = {
      byId: { [id('session-2')]: { displayTitle: '第二个对话' } },
    }
    const props = {
      coordinator,
      t: (key: keyof typeof zh, params?: Record<string, string>) => {
        const message: string = zh[key]
        return Object.entries(params ?? {}).reduce(
          (result, [name, value]) => result.replace(`{${name}}`, value),
          message,
        )
      },
      useSessions: (selector: (state: typeof sessionState) => unknown) => selector(sessionState),
    } as unknown as SplitPaneWorkspaceProps

    render(<SplitPaneWorkspace {...props} />)
    const frame = screen.getByTitle<HTMLIFrameElement>('第二个对话')
    expect(frame.src).toContain('dsh-window=auxiliary')
    expect(frame.src).toContain('dsh-embed=conversation-pane')
    expect(frame.src).toContain('dsh-session=session-2')

    const group = frame.closest<HTMLElement>('[data-multi-pane-group]')!
    Object.defineProperty(group.parentElement!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 800, height: 700, x: 0, y: 0, top: 0, right: 800, bottom: 700, left: 0, toJSON: () => ({}) }),
    })
    const separator = screen.getByRole('separator') as HTMLDivElement & {
      setPointerCapture: (pointerId: number) => void
      hasPointerCapture: (pointerId: number) => boolean
      releasePointerCapture: (pointerId: number) => void
    }
    const captured = new Set<number>()
    separator.setPointerCapture = (pointerId) => { captured.add(pointerId) }
    separator.hasPointerCapture = pointerId => captured.has(pointerId)
    separator.releasePointerCapture = (pointerId) => { captured.delete(pointerId) }
    fireEvent.pointerDown(separator, { pointerId: 7, clientX: 400 })
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 500 })
    fireEvent.pointerUp(separator, { pointerId: 7, clientX: 500 })
    expect(Number.parseFloat(group.style.flexBasis)).toBeCloseTo(37.5)

    fireEvent.click(screen.getByRole('button', { name: '关闭“第二个对话”' }))
    expect(screen.queryByTitle('第二个对话')).toBeNull()
  })

  it('lets users grow either side, restore equal widths, and persist the layout', async () => {
    const values = new Map<string, string>()
    let nextPane = 1
    const coordinator = new MultiPaneCoordinator({
      storage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value) },
      },
      randomId: () => `pane-${nextPane++}`,
      setSplitActive: () => {},
    })
    coordinator.sync(id('session-1'), new Set([
      id('session-1'),
      id('session-2'),
      id('session-3'),
    ]))
    coordinator.openSession(id('session-2'))
    coordinator.openSession(id('session-3'))
    const sessionState = {
      current: id('session-1'),
      byId: {
        [id('session-1')]: { displayTitle: '主对话' },
        [id('session-2')]: { displayTitle: '第二个对话' },
        [id('session-3')]: { displayTitle: '第三个对话' },
      },
    }
    const props = {
      coordinator,
      t: (key: keyof typeof zh, params?: Record<string, string>) => {
        const message: string = zh[key]
        return Object.entries(params ?? {}).reduce(
          (result, [name, value]) => result.replace(`{${name}}`, value),
          message,
        )
      },
      useSessions: (selector: (state: typeof sessionState) => unknown) => selector(sessionState),
    } as unknown as SplitPaneWorkspaceProps

    const { container } = render(<SplitPaneWorkspace {...props} />)
    const group = container.querySelector<HTMLElement>('[data-multi-pane-group]')
    expect(group).not.toBeNull()
    Object.defineProperty(group!.parentElement!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 900, height: 700, x: 0, y: 0, top: 0, right: 900, bottom: 700, left: 0, toJSON: () => ({}) }),
    })

    const separators = screen.getAllByRole('separator')
    expect(separators).toHaveLength(2)
    expect(group!.style.flexBasis).toBe('66.66666666666666%')

    fireEvent.keyDown(separators[0]!, { key: 'ArrowRight' })
    expect(Number.parseFloat(group!.style.flexBasis)).toBeLessThan(66.67)

    const columnsBefore = group!.style.gridTemplateColumns
    fireEvent.keyDown(separators[1]!, { key: 'ArrowRight' })
    expect(group!.style.gridTemplateColumns).not.toBe(columnsBefore)

    await Promise.resolve()
    const stored = JSON.parse(localStorage.getItem('dsh.multi-pane.layout.v1') ?? 'null') as {
      ids: readonly string[]
      ratios: readonly number[]
    }
    expect(stored.ids).toEqual(['primary', 'pane-1', 'pane-2'])
    expect(stored.ratios.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)

    fireEvent.doubleClick(separators[0]!)
    expect(Number.parseFloat(group!.style.flexBasis)).toBeCloseTo(66.666, 2)
    expect(group!.style.gridTemplateColumns).toBe('0.5fr 0.5fr')
  })
})

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ProductCompanion, ProductCompanionSettings, companionFrameUrl } from '../src/client/index.ts'
import { deriveCompanionActivity, deriveCompanionTasks } from '../src/client/activity.ts'
import {
  COMPANION_ANIMATION_FPS,
  COMPANION_FOCUS_SEQUENCE, COMPANION_FRAME_TICK_MS,
  COMPANION_LOUNGE_SEQUENCE,
  COMPANION_PORTAL_ARRIVAL_SEQUENCE, COMPANION_PORTAL_DEPARTURE_SEQUENCE,
  COMPANION_PORTAL_PHASE_MS,
  COMPANION_SUCCESS_DURATION_MS, COMPANION_SUCCESS_SEQUENCE,
  COMPANION_WAITING_SEQUENCE, companionSequenceFrame,
} from '../src/client/animation.ts'
import { zh } from '../src/client/locales.ts'
import type { CompanionPreferences } from '../src/client/store.ts'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  document.body.replaceChildren()
})

const sid = (value: string): SessionId => value as SessionId

function sessions(overrides: Partial<SessionListState> = {}): SessionListState {
  const active = sid('active')
  return {
    ids: [active],
    byId: {
      [active]: {
        id: active,
        displayTitle: '修复登录流程',
        running: true,
        blank: false,
        updatedAt: 20,
      },
    },
    current: active,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
    ...overrides,
  }
}

function companionRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>('[data-product-companion]')
  if (root === null) throw new Error('Product companion root was not rendered')
  return root
}

function companionSurface(): HTMLElement {
  const surface = document.querySelector<HTMLElement>('[data-companion-surface]')
  if (surface === null) throw new Error('Product companion surface was not rendered')
  return surface
}

function installComposer(): { composer: HTMLElement; textarea: HTMLTextAreaElement } {
  const composer = document.createElement('div')
  composer.setAttribute('data-composer-card', '')
  const textarea = document.createElement('textarea')
  composer.append(textarea)
  vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
    left: 480, right: 960, top: 620, bottom: 720, width: 480, height: 100,
    x: 480, y: 620, toJSON: () => ({}),
  })
  document.body.append(composer)
  return { composer, textarea }
}

function companionActions() {
  return {
    setSkin: vi.fn(),
    setDisplayName: vi.fn(),
    setVisible: vi.fn(),
    setPosition: vi.fn(),
    setHome: vi.fn(),
    setSize: vi.fn(),
    setClickAction: vi.fn(),
    setDoubleClickAction: vi.fn(),
    setContextAction: vi.fn(),
    setShowStatus: vi.fn(),
    setAutoTravel: vi.fn(),
    resetPosition: vi.fn(),
  }
}

describe('product companion', () => {
  it('maps waiting work ahead of ordinary running work', () => {
    const active = sid('active')
    const waiting = sid('waiting')
    const value = sessions({
      ids: [active, waiting],
      byId: {
        ...sessions().byId,
        [waiting]: {
          id: waiting,
          displayTitle: '等待批准',
          running: true,
          pendingInteraction: 'approval',
          blank: false,
          updatedAt: 30,
        },
      },
    })
    expect(deriveCompanionActivity(value)).toEqual({
      state: 'waiting',
      running: 2,
      waiting: 1,
      focusTitle: '等待批准',
      latestUpdate: 30,
    })
    expect(deriveCompanionTasks(value).map(task => task.id)).toEqual([waiting, active])
  })

  it('exposes concurrent work as a compact task switcher and keeps voice reserved', () => {
    vi.useFakeTimers()
    installComposer()
    const active = sid('active')
    const waiting = sid('waiting')
    const background = sid('background')
    const openSession = vi.fn()
    const value = sessions({
      ids: [active, waiting, background],
      byId: {
        [active]: {
          id: active,
          displayTitle: '整理周报',
          running: true,
          blank: false,
          updatedAt: 20,
        },
        [waiting]: {
          id: waiting,
          displayTitle: '确认发布权限',
          running: true,
          pendingInteraction: 'approval',
          blank: false,
          updatedAt: 30,
        },
        [background]: {
          id: background,
          displayTitle: '检查数据源',
          running: true,
          blank: false,
          updatedAt: 25,
        },
      },
    })
    let currentValue = value
    const useSessions = ((selector: (state: SessionListState) => unknown) => selector(currentValue)) as never
    const view = render(<ProductCompanion
      useSessions={useSessions}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', visible: true, position: null, home: 'composer', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      openSession={openSession}
      t={makeTranslate(zh)}
    />)

    expect(screen.getByRole('button', { name: 'AI 语音输入，敬请期待' }).hasAttribute('disabled')).toBe(true)
    const toggle = screen.getByRole('button', { name: '展开 3 个进行中的任务' })
    expect(toggle.textContent).toBe('3')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('进行中的任务')).toBeTruthy()
    expect(screen.getByText('确认发布权限')).toBeTruthy()
    expect(screen.getByText('整理周报')).toBeTruthy()
    expect(screen.getByText('检查数据源')).toBeTruthy()

    const target = screen.getByText('检查数据源').closest('button')
    if (target === null) throw new Error('task switcher row was not a button')
    fireEvent.click(target)
    expect(openSession).toHaveBeenCalledWith(background)
    expect(screen.getByLabelText('进行中的任务').getAttribute('data-state')).toBe('open')

    currentValue = { ...value, current: background }
    view.rerender(<ProductCompanion
      useSessions={useSessions}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', visible: true, position: null, home: 'composer', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      openSession={openSession}
      t={makeTranslate(zh)}
    />)
    expect(screen.getByText('检查数据源').closest('button')?.getAttribute('data-current')).toBe('true')
    expect(screen.getByLabelText('进行中的任务').getAttribute('data-state')).toBe('open')

    fireEvent.click(screen.getByRole('button', { name: '收起 3 个进行中的任务' }))
    expect(screen.getByLabelText('进行中的任务').getAttribute('data-state')).toBe('closing')
    act(() => { vi.advanceTimersByTime(300) })
    expect(screen.queryByLabelText('进行中的任务')).toBeNull()
  })

  it('stays prone above the composer and ignores hover and ordinary click', () => {
    vi.useFakeTimers()
    installComposer()
    const active = sid('active')
    const idleState = sessions({
      byId: {
        [active]: {
          id: active,
          displayTitle: '修复登录流程',
          running: false,
          blank: false,
          updatedAt: 20,
        },
      },
    })
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(idleState)) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    const trigger = companionSurface()
    const root = companionRoot()
    expect(trigger.querySelector('img:last-of-type')?.getAttribute('src')).toBe(companionFrameUrl('blue', 'lounge', 0))
    fireEvent.mouseEnter(trigger)
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(root.getAttribute('data-motion')).toBe('rest')
    expect(root.getAttribute('data-track')).toBe('lounge')
    expect(root.getAttribute('data-habitat')).toBe('composer')
    expect(root.getAttribute('data-side')).toBe('right')
    expect(root.style.getPropertyValue('--companion-y')).toBe('488px')
    expect(root.style.getPropertyValue('--companion-width')).toBe('164px')
    expect(trigger.querySelectorAll('img')).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(COMPANION_SUCCESS_DURATION_MS) })
    expect(root.getAttribute('data-motion')).toBe('rest')
    expect(root.getAttribute('data-track')).toBe('lounge')
  })

  it('steps out while a true modal is open and returns when it closes', async () => {
    installComposer()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', visible: true, position: null, home: 'composer', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    expect(document.querySelector('[data-product-companion]')).toBeNull()
    // Let the companion finish its first layout pass while the modal is still
    // present. This matches a plugin being enabled from inside Settings.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 32)) })
    dialog.remove()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 32)) })
    expect(companionRoot()).toBeTruthy()
  })

  it('stays mounted while the non-modal Model Usage panel is open', () => {
    installComposer()
    const usagePanel = document.createElement('section')
    usagePanel.setAttribute('role', 'dialog')
    usagePanel.setAttribute('aria-label', '模型用量概览')
    document.body.append(usagePanel)
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', visible: true, position: null, home: 'composer', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    expect(companionRoot().getAttribute('data-habitat')).toBe('composer')
    expect(document.querySelector('[aria-label="模型用量概览"]')).toBe(usagePanel)
  })

  it('uses the current surface as an acting pose without announcing a fake task state', () => {
    const active = sid('active')
    const idleState = sessions({
      byId: {
        [active]: {
          id: active,
          displayTitle: '修复登录流程',
          running: false,
          blank: false,
          updatedAt: 20,
        },
      },
    })
    const composer = document.createElement('div')
    composer.setAttribute('data-composer-card', '')
    vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
      left: 480, right: 960, top: 620, bottom: 720, width: 480, height: 100,
      x: 480, y: 620, toJSON: () => ({}),
    })
    document.body.append(composer)
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(idleState)) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'composer', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    const root = companionRoot()
    expect(root.getAttribute('data-state')).toBe('idle')
    expect(root.getAttribute('data-pose')).toBe('idle')
    expect(root.getAttribute('data-track')).toBe('lounge')
    expect(screen.getByText('在旁边陪你')).toBeTruthy()
  })

  it('stays prone on the composer while the user drafts', () => {
    vi.useFakeTimers()
    const active = sid('active')
    const idleState = sessions({
      byId: {
        [active]: {
          id: active,
          displayTitle: '起草消息',
          running: false,
          blank: false,
          updatedAt: 20,
        },
      },
    })
    const composer = document.createElement('div')
    composer.setAttribute('data-composer-card', '')
    const textarea = document.createElement('textarea')
    composer.append(textarea)
    vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
      left: 480, right: 960, top: 620, bottom: 720, width: 480, height: 100,
      x: 480, y: 620, toJSON: () => ({}),
    })
    document.body.append(composer)
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(idleState)) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    fireEvent.input(textarea, { target: { value: '请审查这个改动' } })
    expect(companionRoot().getAttribute('data-scene')).toBe('drafting')
    expect(companionRoot().getAttribute('data-track')).toBe('lounge')
    act(() => { vi.advanceTimersByTime(COMPANION_FRAME_TICK_MS * 8) })
    expect(companionSurface().querySelectorAll('img')).toHaveLength(1)
  })

  it("teleports to the composer's new position without changing character size", () => {
    vi.useFakeTimers()
    const { composer } = installComposer()
    const active = sid('active')
    const idleState = sessions({
      byId: {
        [active]: {
          id: active,
          displayTitle: '等待输入',
          running: false,
          blank: false,
          updatedAt: 20,
        },
      },
    })
    const rect = vi.mocked(composer.getBoundingClientRect)
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(idleState)) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: false,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    const root = companionRoot()
    const initialX = root.style.getPropertyValue('--companion-x')
    const initialY = root.style.getPropertyValue('--companion-y')
    const initialWidth = root.style.getPropertyValue('--companion-width')
    const initialHeight = root.style.getPropertyValue('--companion-height')
    fireEvent.pointerDown(companionSurface(), { pointerId: 1, button: 0 })
    expect(root.hasAttribute('data-dragging')).toBe(false)

    rect.mockReturnValue({
      left: 480, right: 960, top: 480, bottom: 580, width: 480, height: 100,
      x: 480, y: 480, toJSON: () => ({}),
    })
    act(() => {
      composer.append(document.createElement('span'))
      vi.advanceTimersByTime(32)
    })
    expect(root.getAttribute('data-moving')).toBe('true')
    expect(root.getAttribute('data-motion')).toBe('portal')
    expect(root.getAttribute('data-track')).toBe('portal')
    expect(root.getAttribute('data-asset')).toBe('portal')
    expect(root.getAttribute('data-teleport')).toBe('departing')
    expect(root.style.getPropertyValue('--companion-x')).toBe(initialX)
    expect(root.style.getPropertyValue('--companion-y')).toBe(initialY)
    expect(root.style.getPropertyValue('--companion-width')).toBe(initialWidth)
    expect(root.style.getPropertyValue('--companion-height')).toBe(initialHeight)

    act(() => { vi.advanceTimersByTime(COMPANION_PORTAL_PHASE_MS + 1) })
    expect(root.getAttribute('data-teleport')).toBe('arriving')
    expect(parseFloat(root.style.getPropertyValue('--companion-y'))).toBeLessThan(parseFloat(initialY))
    expect(root.style.getPropertyValue('--companion-width')).toBe(initialWidth)
    expect(root.style.getPropertyValue('--companion-height')).toBe(initialHeight)

    act(() => { vi.advanceTimersByTime(COMPANION_PORTAL_PHASE_MS + 1) })
    expect(root.getAttribute('data-moving')).toBe('false')
    expect(root.getAttribute('data-teleport')).toBe('idle')
    expect(root.getAttribute('data-track')).toBe('lounge')
    expect(root.getAttribute('data-habitat')).toBe('composer')
    expect(root.getAttribute('data-side')).toBe('right')
  })

  it('opens a product-style action menu on right click', () => {
    installComposer()
    const setVisible = vi.fn()
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: false,
      })) as never}
      actions={{ ...companionActions(), setVisible }}
      t={makeTranslate(zh)}
    />)

    const trigger = companionSurface()
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem')).toBeNull()
    fireEvent.contextMenu(trigger)
    expect(screen.getByRole('menuitem', { name: '新建对话' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '聚焦输入框' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: '换到另一侧' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: '关闭鲸少女' }))
    expect(setVisible).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('keeps single and double click distinct and can bind right click directly', () => {
    vi.useFakeTimers()
    const { textarea } = installComposer()
    const startSession = vi.fn()
    const preferences: CompanionPreferences = {
      skin: 'blue', size: 'large', position: null, home: 'composer', showStatus: true,
      autoTravel: false, clickAction: 'focusComposer', doubleClickAction: 'newSession',
      contextAction: 'newSession',
    }
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector(preferences)) as never}
      actions={companionActions()}
      startSession={startSession}
      t={makeTranslate(zh)}
    />)

    const trigger = companionSurface()
    fireEvent.click(trigger, { detail: 1 })
    act(() => { vi.advanceTimersByTime(240) })
    expect(document.activeElement).toBe(textarea)

    textarea.blur()
    fireEvent.click(trigger, { detail: 1 })
    fireEvent.click(trigger, { detail: 2 })
    act(() => { vi.advanceTimersByTime(240) })
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(textarea)

    fireEvent.contextMenu(trigger)
    expect(startSession).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('uses stable same-origin URLs for every generated state frame', () => {
    expect(companionFrameUrl('black', 'waiting', 11))
      .toBe('/plugins/ui-product-companion/assets/v8/black-waiting-12.png')
    expect(companionFrameUrl('blue', 'lounge', 99))
      .toBe('/plugins/ui-product-companion/assets/v8/blue-lounge-20.png')
    expect(companionFrameUrl('blue', 'portal', 99))
      .toBe('/plugins/ui-product-companion/assets/v8/blue-portal-06.png')
  })

  it('uses a 24 fps exposure sheet and every authored drawing', () => {
    expect(COMPANION_ANIMATION_FPS).toBe(24)
    expect(COMPANION_FRAME_TICK_MS).toBeCloseTo(41.667, 2)
    expect(new Set(COMPANION_LOUNGE_SEQUENCE.map(step => step.frame)))
      .toEqual(new Set(Array.from({ length: 20 }, (_, index) => index)))
    expect(COMPANION_PORTAL_DEPARTURE_SEQUENCE.map(step => step.frame))
      .toEqual([0, 1, 2, 3, 4, 5])
    expect(COMPANION_PORTAL_ARRIVAL_SEQUENCE.map(step => step.frame))
      .toEqual([5, 4, 3, 2, 1, 0])
    expect(new Set(COMPANION_FOCUS_SEQUENCE.map(step => step.frame)))
      .toEqual(new Set(Array.from({ length: 12 }, (_, index) => index)))
    expect(new Set(COMPANION_WAITING_SEQUENCE.map(step => step.frame)))
      .toEqual(new Set(Array.from({ length: 12 }, (_, index) => index)))
    expect(new Set(COMPANION_SUCCESS_SEQUENCE.map(step => step.frame)))
      .toEqual(new Set(Array.from({ length: 12 }, (_, index) => index)))
    for (const step of [
      ...COMPANION_LOUNGE_SEQUENCE,
      ...COMPANION_PORTAL_DEPARTURE_SEQUENCE,
      ...COMPANION_PORTAL_ARRIVAL_SEQUENCE,
      ...COMPANION_FOCUS_SEQUENCE,
      ...COMPANION_WAITING_SEQUENCE,
      ...COMPANION_SUCCESS_SEQUENCE,
    ]) {
      expect(step.durationMs / COMPANION_FRAME_TICK_MS).toBeCloseTo(
        Math.round(step.durationMs / COMPANION_FRAME_TICK_MS),
        5,
      )
    }
    expect(companionSequenceFrame(COMPANION_PORTAL_DEPARTURE_SEQUENCE, 0, false)).toBe(0)
    expect(companionSequenceFrame(
      COMPANION_PORTAL_DEPARTURE_SEQUENCE,
      COMPANION_PORTAL_PHASE_MS + 100,
      false,
    )).toBe(5)
    expect(companionSequenceFrame(
      COMPANION_SUCCESS_SEQUENCE,
      COMPANION_SUCCESS_DURATION_MS + 500,
      false,
    )).toBe(11)
  })

  it('keeps active Agent work prone without an upright portal transition', () => {
    installComposer()
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: false,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)
    expect(companionRoot().getAttribute('data-track')).toBe('focus')
    expect(companionRoot().getAttribute('data-asset')).toBe('focus')
    expect(companionRoot().getAttribute('data-scene')).toBe('working')
  })

  it('shows real observed task time and preserves it for the completion response', () => {
    vi.useFakeTimers()
    installComposer()
    const active = sid('active')
    let current = sessions()
    const useSessions = (selector: (state: SessionListState) => unknown) => selector(current)
    const useStore = (selector: (state: CompanionPreferences) => unknown) => selector({
      skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
    })
    const actions = companionActions()
    const { rerender } = render(<ProductCompanion
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      useStore={useStore as never}
      actions={actions}
      t={makeTranslate(zh)}
    />)

    act(() => { vi.advanceTimersByTime(1_500) })
    expect(screen.getByText('正在处理 · 1秒')).toBeTruthy()

    current = sessions({
      byId: {
        [active]: {
          id: active,
          displayTitle: '修复登录流程',
          running: false,
          blank: false,
          updatedAt: 40,
        },
      },
    })
    rerender(<ProductCompanion
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      useStore={useStore as never}
      actions={actions}
      t={makeTranslate(zh)}
    />)
    expect(screen.getByText('已完成 · 1秒')).toBeTruthy()
  })

  it('keeps the companion beside the composer after a followed task completes', () => {
    vi.useFakeTimers()
    const active = sid('active')
    const composer = document.createElement('div')
    composer.setAttribute('data-composer-card', '')
    vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
      left: 480, right: 960, top: 620, bottom: 720, width: 480, height: 100,
      x: 480, y: 620, toJSON: () => ({}),
    })
    document.body.append(composer)

    let current = sessions()
    const preferences: CompanionPreferences = {
      skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
    }
    const useSessions = (selector: (state: SessionListState) => unknown) => selector(current)
    const useStore = (selector: (state: CompanionPreferences) => unknown) => selector(preferences)
    const actions = companionActions()
    const view = render(<ProductCompanion
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      useStore={useStore as never}
      actions={actions}
      t={makeTranslate(zh)}
    />)
    current = sessions({
      byId: {
        [active]: {
          id: active,
          displayTitle: '修复登录流程',
          running: false,
          blank: false,
          updatedAt: 40,
        },
      },
    })
    view.rerender(<ProductCompanion
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      useStore={useStore as never}
      actions={actions}
      t={makeTranslate(zh)}
    />)

    const root = companionRoot()
    expect(root.getAttribute('data-habitat')).toBe('composer')
    expect(root.getAttribute('data-side')).toBe('right')
    act(() => { vi.advanceTimersByTime(8_000) })
    expect(root.getAttribute('data-habitat')).toBe('composer')
  })

  it('moves skin and behavior controls into one dedicated settings page', () => {
    const setSkin = vi.fn()
    const setSize = vi.fn()
    const setClickAction = vi.fn()
    const setVisible = vi.fn()
    const setShowStatus = vi.fn()
    const setDisplayName = vi.fn()
    render(<ProductCompanionSettings
      useSessions={vi.fn() as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
      })) as never}
      actions={{
        ...companionActions(), setSkin, setVisible, setSize, setClickAction, setShowStatus, setDisplayName,
      }}
      t={makeTranslate(zh)}
      close={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('radio', { name: /夜航黑/ }))
    expect(setSkin).toHaveBeenCalledExactlyOnceWith('black')
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '标准' }))
    expect(setSize).toHaveBeenCalledExactlyOnceWith('standard')
    fireEvent.click(screen.getByRole('button', { name: '聚焦输入框' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '无操作' }))
    expect(setClickAction).toHaveBeenCalledExactlyOnceWith('none')
    fireEvent.click(screen.getByRole('checkbox', { name: '显示任务状态' }))
    expect(setShowStatus).toHaveBeenCalledExactlyOnceWith(false)
    expect(screen.getByRole('heading', { name: '鲸少女' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '修改名字' }))
    fireEvent.change(screen.getByRole('textbox', { name: '数字伙伴名字' }), {
      target: { value: '小蓝' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存名字' }))
    expect(setDisplayName).toHaveBeenCalledExactlyOnceWith('小蓝')
    fireEvent.click(screen.getByRole('checkbox', { name: '显示鲸少女' }))
    expect(setVisible).toHaveBeenCalledExactlyOnceWith(false)
    expect(screen.queryByRole('checkbox', { name: '跟随当前任务' })).toBeNull()
    expect(screen.queryByRole('button', { name: '恢复默认位置' })).toBeNull()
  })
})

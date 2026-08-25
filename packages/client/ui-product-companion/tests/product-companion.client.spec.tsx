// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  ProductCompanion, ProductCompanionSettings, companionDissolveMaskUrl, companionFrameUrl,
  insertVoiceText, matchesVoiceShortcut,
  persistedCompanionName,
} from '../src/client/index.ts'
import { deriveCompanionActivity, deriveCompanionTasks } from '../src/client/activity.ts'
import {
  COMPANION_ANIMATION_FPS,
  COMPANION_FOCUS_SEQUENCE, COMPANION_FRAME_TICK_MS,
  COMPANION_LOUNGE_SEQUENCE,
  COMPANION_DISSOLVE_FRAME_COUNT, COMPANION_DISSOLVE_PHASE_MS,
  COMPANION_SUCCESS_DURATION_MS, COMPANION_SUCCESS_SEQUENCE,
  COMPANION_WAITING_SEQUENCE, companionDissolveFrame, companionSequenceFrame,
} from '../src/client/animation.ts'
import { zh } from '../src/client/locales.ts'
import type { CompanionPreferences } from '../src/client/store.ts'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
  localStorage.clear()
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
    setVoiceEnabled: vi.fn(),
    setVoiceShortcut: vi.fn(),
  }
}

describe('product companion', () => {
  it('uses the persisted custom name as the settings navigation label', () => {
    expect(persistedCompanionName()).toBe('鲸少女')
    localStorage.setItem('dsh.product-companion', JSON.stringify({ displayName: '  小蓝  ' }))
    expect(persistedCompanionName()).toBe('小蓝')
    localStorage.setItem('dsh.product-companion', '{broken')
    expect(persistedCompanionName()).toBe('鲸少女')
  })

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

  it('exposes concurrent work as a compact task switcher and reports unsupported voice honestly', () => {
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

    expect(screen.getByRole('button', { name: '当前浏览器不支持语音识别' }).hasAttribute('disabled')).toBe(true)
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

  it('changes only the display box when switching between Standard and Large', () => {
    vi.useFakeTimers()
    installComposer()
    const active = sid('active')
    const idleState = sessions({
      byId: {
        [active]: {
          id: active,
          displayTitle: '检查传送尺寸',
          running: false,
          blank: false,
          updatedAt: 20,
        },
      },
    })
    let size: CompanionPreferences['size'] = 'standard'
    const useStore = (selector: (state: CompanionPreferences) => unknown) => selector({
      skin: 'blue', size, position: null, home: 'composer', showStatus: true, autoTravel: true,
    } as CompanionPreferences)
    const view = render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(idleState)) as never}
      useWorkspaces={vi.fn() as never}
      useStore={useStore as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    const root = companionRoot()
    const standardSource = companionSurface().querySelector('img')?.getAttribute('src')
    expect(standardSource).toContain('/blue-lounge-')
    expect(root.getAttribute('data-size')).toBe('standard')
    expect(root.style.getPropertyValue('--companion-width')).toBe('132px')
    expect(root.style.getPropertyValue('--companion-height')).toBe('118px')

    size = 'large'
    view.rerender(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(idleState)) as never}
      useWorkspaces={vi.fn() as never}
      useStore={useStore as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)
    expect(root.getAttribute('data-size')).toBe('large')
    expect(root.style.getPropertyValue('--companion-width')).toBe('164px')
    expect(root.style.getPropertyValue('--companion-height')).toBe('147px')
    act(() => { vi.advanceTimersByTime(120 + COMPANION_DISSOLVE_PHASE_MS * 2 + 1) })
    expect(companionSurface().querySelector('img')?.getAttribute('src')).toContain('/blue-lounge-')
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
    const initialCharacterSrc = companionSurface().querySelector<HTMLImageElement>('img')?.src
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
    expect(root.getAttribute('data-moving')).toBe('false')
    act(() => { vi.advanceTimersByTime(120) })
    expect(root.getAttribute('data-moving')).toBe('true')
    expect(root.getAttribute('data-motion')).toBe('dissolve')
    expect(root.getAttribute('data-track')).toBe('dissolve')
    expect(root.getAttribute('data-asset')).toBe('lounge')
    expect(root.getAttribute('data-teleport')).toBe('departing')
    const accessories = root.querySelector<HTMLElement>('[data-companion-accessories]')
    expect(accessories?.getAttribute('data-phase')).toBe('departing')
    expect(accessories?.getAttribute('aria-hidden')).toBe('true')
    const materialImages = [...companionSurface().querySelectorAll<HTMLImageElement>('img')]
    expect(materialImages.length).toBeGreaterThanOrEqual(2)
    expect(new Set(materialImages.map(image => image.src))).toEqual(new Set([initialCharacterSrc]))
    expect(materialImages.some(image => image.style.getPropertyValue('--companion-material-mask')
      .includes('/v13/body-mask-01.png'))).toBe(true)
    expect(materialImages.some(image => image.style.getPropertyValue('--companion-material-mask')
      .includes('/v13/fragment-mask-01.png'))).toBe(true)
    expect(companionSurface().querySelector('img[src*="bubble-effect"]')).toBeNull()
    expect(root.style.getPropertyValue('--companion-x')).toBe(initialX)
    expect(root.style.getPropertyValue('--companion-y')).toBe(initialY)
    expect(root.style.getPropertyValue('--companion-width')).toBe(initialWidth)
    expect(root.style.getPropertyValue('--companion-height')).toBe(initialHeight)
    expect(new Set([...companionSurface().querySelectorAll<HTMLImageElement>('img')]
      .map(image => image.src))).toEqual(new Set([initialCharacterSrc]))

    act(() => { vi.advanceTimersByTime(COMPANION_DISSOLVE_PHASE_MS + 1) })
    expect(root.getAttribute('data-teleport')).toBe('arriving')
    expect(accessories?.getAttribute('data-phase')).toBe('arriving')
    expect(accessories?.getAttribute('aria-hidden')).toBe('true')
    expect(parseFloat(root.style.getPropertyValue('--companion-y'))).toBeLessThan(parseFloat(initialY))
    expect(root.style.getPropertyValue('--companion-width')).toBe(initialWidth)
    expect(root.style.getPropertyValue('--companion-height')).toBe(initialHeight)
    expect(new Set([...companionSurface().querySelectorAll<HTMLImageElement>('img')]
      .map(image => image.src))).toEqual(new Set([initialCharacterSrc]))

    act(() => { vi.advanceTimersByTime(COMPANION_DISSOLVE_PHASE_MS + 1) })
    expect(root.getAttribute('data-moving')).toBe('false')
    expect(root.getAttribute('data-teleport')).toBe('idle')
    expect(accessories?.getAttribute('data-phase')).toBe('idle')
    expect(accessories?.hasAttribute('aria-hidden')).toBe(false)
    expect(root.getAttribute('data-track')).toBe('lounge')
    expect(root.getAttribute('data-habitat')).toBe('composer')
    expect(root.getAttribute('data-side')).toBe('right')
  })

  it('does not teleport when conversation reflow returns the composer to the same place', () => {
    vi.useFakeTimers()
    const { composer } = installComposer()
    const rect = vi.mocked(composer.getBoundingClientRect)
    const active = sid('active')
    const other = sid('other')
    let current = sessions({
      ids: [active, other],
      byId: {
        ...sessions().byId,
        [other]: {
          id: other,
          displayTitle: '另一段对话',
          running: false,
          blank: false,
          updatedAt: 30,
        },
      },
    })
    const useSessions = (selector: (state: SessionListState) => unknown) => selector(current)
    const view = render(<ProductCompanion
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'composer', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    const root = companionRoot()
    const initialX = root.style.getPropertyValue('--companion-x')
    const initialY = root.style.getPropertyValue('--companion-y')

    current = { ...current, current: other }
    view.rerender(<ProductCompanion
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'composer', showStatus: true, autoTravel: true,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)
    rect.mockReturnValue({
      left: 480, right: 960, top: 760, bottom: 860, width: 480, height: 100,
      x: 480, y: 760, toJSON: () => ({}),
    })
    act(() => {
      composer.append(document.createElement('span'))
      vi.advanceTimersByTime(32)
    })
    act(() => { vi.advanceTimersByTime(170) })
    expect(root.getAttribute('data-teleport')).toBe('idle')

    rect.mockReturnValue({
      left: 480, right: 960, top: 620, bottom: 720, width: 480, height: 100,
      x: 480, y: 620, toJSON: () => ({}),
    })
    act(() => {
      composer.append(document.createElement('span'))
      vi.advanceTimersByTime(32)
    })
    act(() => { vi.advanceTimersByTime(360) })
    expect(root.getAttribute('data-teleport')).toBe('idle')
    expect(root.getAttribute('data-track')).not.toBe('dissolve')
    expect(root.style.getPropertyValue('--companion-x')).toBe(initialX)
    expect(root.style.getPropertyValue('--companion-y')).toBe(initialY)
  })

  it('opens one close action below the companion on right click', () => {
    installComposer()
    const setVisible = vi.fn()
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: false,
        displayName: '阿鲸',
      })) as never}
      actions={{ ...companionActions(), setVisible }}
      t={makeTranslate(zh)}
    />)

    const trigger = companionSurface()
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem')).toBeNull()
    fireEvent.contextMenu(trigger)
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: '新建对话' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: '聚焦输入框' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: '关闭阿鲸' }))
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
      .toBe('/plugins/ui-product-companion/assets/v14/black-waiting-12.png')
    expect(companionFrameUrl('blue', 'lounge', 99))
      .toBe('/plugins/ui-product-companion/assets/v14/blue-lounge-20.png')
    expect(companionFrameUrl('blue', 'portal', 99))
      .toBe('/plugins/ui-product-companion/assets/v14/blue-portal-12.png')
    expect(companionDissolveMaskUrl('body'))
      .toBe('/plugins/ui-product-companion/assets/v13/body-mask-01.png')
    expect(companionDissolveMaskUrl('fragment', 99))
      .toBe('/plugins/ui-product-companion/assets/v13/fragment-mask-48.png')
  })

  it('uses a 24 fps exposure sheet and every authored drawing', () => {
    expect(COMPANION_ANIMATION_FPS).toBe(24)
    expect(COMPANION_FRAME_TICK_MS).toBeCloseTo(41.667, 2)
    expect(new Set(COMPANION_LOUNGE_SEQUENCE.map(step => step.frame)))
      .toEqual(new Set(Array.from({ length: 20 }, (_, index) => index)))
    expect(new Set(COMPANION_FOCUS_SEQUENCE.map(step => step.frame)))
      .toEqual(new Set(Array.from({ length: 12 }, (_, index) => index)))
    expect(new Set(COMPANION_WAITING_SEQUENCE.map(step => step.frame)))
      .toEqual(new Set(Array.from({ length: 12 }, (_, index) => index)))
    expect(new Set(COMPANION_SUCCESS_SEQUENCE.map(step => step.frame)))
      .toEqual(new Set(Array.from({ length: 12 }, (_, index) => index)))
    for (const step of [
      ...COMPANION_LOUNGE_SEQUENCE,
      ...COMPANION_FOCUS_SEQUENCE,
      ...COMPANION_WAITING_SEQUENCE,
      ...COMPANION_SUCCESS_SEQUENCE,
    ]) {
      expect(step.durationMs / COMPANION_FRAME_TICK_MS).toBeCloseTo(
        Math.round(step.durationMs / COMPANION_FRAME_TICK_MS),
        5,
      )
    }
    expect(COMPANION_DISSOLVE_PHASE_MS).toBe(1_040)
    expect(COMPANION_DISSOLVE_FRAME_COUNT).toBe(48)
    expect(companionDissolveFrame(0)).toBe(0)
    expect(companionDissolveFrame(COMPANION_DISSOLVE_PHASE_MS - 1)).toBe(47)
    expect(companionDissolveFrame(0, true)).toBe(47)
    expect(companionDissolveFrame(COMPANION_DISSOLVE_PHASE_MS - 1, true)).toBe(0)
    expect(companionSequenceFrame(
      COMPANION_SUCCESS_SEQUENCE,
      COMPANION_SUCCESS_DURATION_MS + 500,
      false,
    )).toBe(11)
  })

  it('keeps active Agent work prone without an upright transition', () => {
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

  it('settles the working pose when the current Agent has no new progress', () => {
    vi.useFakeTimers()
    installComposer()
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'composer', showStatus: true, autoTravel: false,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    act(() => { vi.advanceTimersByTime(2_000) })
    expect(companionRoot().getAttribute('data-track')).toBe('focus')
    expect(companionRoot().getAttribute('data-frame')).toBe('0')
  })

  it('keeps the character calm when only a background conversation is running', () => {
    installComposer()
    const active = sid('active')
    const background = sid('background')
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions({
        ids: [active, background],
        byId: {
          [active]: {
            id: active,
            displayTitle: '当前对话',
            running: false,
            blank: false,
            updatedAt: 20,
          },
          [background]: {
            id: background,
            displayTitle: '后台整理资料',
            running: true,
            blank: false,
            updatedAt: 30,
          },
        },
      }))) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'composer', showStatus: true, autoTravel: false,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    expect(companionRoot().getAttribute('data-track')).toBe('lounge')
  })

  it('gives a covered underlying control priority over the character primary click', () => {
    installComposer()
    const activateUnderlying = vi.fn()
    const underlying = document.createElement('button')
    underlying.type = 'button'
    underlying.textContent = '底层操作'
    underlying.addEventListener('click', activateUnderlying)
    document.body.append(underlying)
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [underlying]),
    })
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'composer', showStatus: true, autoTravel: false,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    const surface = companionSurface()
    fireEvent.pointerDown(surface, { button: 0, pointerId: 7, clientX: 724, clientY: 534 })
    fireEvent.pointerUp(surface, { button: 0, pointerId: 7, clientX: 724, clientY: 534 })
    expect(activateUnderlying).toHaveBeenCalledOnce()
  })

  it('cancels a pending character click when the next press belongs to an underlying control', () => {
    vi.useFakeTimers()
    const { textarea } = installComposer()
    const underlying = document.createElement('button')
    underlying.type = 'button'
    document.body.append(underlying)
    const elementsFromPoint = vi.fn<() => Element[]>(() => [])
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: elementsFromPoint,
    })
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'composer', showStatus: true, autoTravel: false,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    const surface = companionSurface()
    fireEvent.click(surface, { detail: 1 })
    elementsFromPoint.mockReturnValue([underlying])
    fireEvent.pointerDown(surface, { button: 0, pointerId: 8, clientX: 724, clientY: 534 })
    fireEvent.pointerUp(surface, { button: 0, pointerId: 8, clientX: 724, clientY: 534 })
    act(() => { vi.advanceTimersByTime(240) })
    expect(document.activeElement).not.toBe(textarea)
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

  it('inserts raw browser dictation at the caret without an AI request or native tooltip', async () => {
    const { textarea } = installComposer()
    textarea.value = '前文'
    textarea.setSelectionRange(2, 2)
    class MockRecognition {
      static latest: MockRecognition | null = null
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult: ((event: never) => void) | null = null
      onerror: ((event: never) => void) | null = null
      onend: (() => void) | null = null
      constructor() { MockRecognition.latest = this }
      start(): void {}
      stop(): void { this.onend?.() }
      abort(): void {}
    }
    window.webkitSpeechRecognition = MockRecognition as never
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', visible: true, position: null, home: 'composer', showStatus: true, autoTravel: true,
        voiceEnabled: true, voiceShortcut: 'Alt+Space',
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    const microphone = screen.getByRole('button', { name: '开始语音输入' })
    expect(microphone.getAttribute('title')).toBeNull()
    expect(microphone.getAttribute('data-control')).toBe('voice')
    fireEvent.mouseEnter(microphone)
    expect(screen.queryByRole('tooltip')).toBeNull()
    const characterTrack = companionRoot().getAttribute('data-track')
    fireEvent.click(microphone)
    expect(MockRecognition.latest?.continuous).toBe(true)
    expect(companionRoot().getAttribute('data-track')).toBe(characterTrack)
    expect(screen.getByRole('button', { name: '结束听写' })).toBeTruthy()
    MockRecognition.latest?.onresult?.({
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: '请继续处理' } } },
    } as never)
    fireEvent.click(screen.getByRole('button', { name: '结束听写' }))
    await waitFor(() => { expect(textarea.value).toBe('前文 请继续处理') })
    expect(document.activeElement).toBe(textarea)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.getByText('已放入输入框')).toBeTruthy()
  })

  it('keeps dictation open across browser recognition rotations until the user stops it', async () => {
    const { textarea } = installComposer()
    textarea.value = '前文'
    textarea.setSelectionRange(2, 2)
    class MockRecognition {
      static latest: MockRecognition | null = null
      static startCount = 0
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult: ((event: never) => void) | null = null
      onerror: ((event: never) => void) | null = null
      onend: (() => void) | null = null
      constructor() { MockRecognition.latest = this }
      start(): void { MockRecognition.startCount += 1 }
      stop(): void { this.onend?.() }
      abort(): void {}
    }
    window.webkitSpeechRecognition = MockRecognition as never
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', visible: true, position: null, home: 'composer', showStatus: true, autoTravel: true,
        voiceEnabled: true, voiceShortcut: 'Alt+Space',
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
    />)

    fireEvent.click(screen.getByRole('button', { name: '开始语音输入' }))
    MockRecognition.latest?.onresult?.({
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: '第一段' } } },
    } as never)
    MockRecognition.latest?.onend?.()

    await waitFor(() => { expect(MockRecognition.startCount).toBe(2) })
    expect(screen.getByRole('button', { name: '结束听写' })).toBeTruthy()
    expect(textarea.value).toBe('前文')

    MockRecognition.latest?.onresult?.({
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: '第二段' } } },
    } as never)
    fireEvent.click(screen.getByRole('button', { name: '结束听写' }))
    await waitFor(() => { expect(textarea.value).toBe('前文 第一段 第二段') })
  })

  it('matches only the configured chord and inserts at a selected range', () => {
    expect(matchesVoiceShortcut(new KeyboardEvent('keydown', {
      key: ' ', code: 'Space', altKey: true,
    }), 'Alt+Space')).toBe(true)
    expect(matchesVoiceShortcut(new KeyboardEvent('keydown', {
      key: ' ', code: 'Space', metaKey: true,
    }), 'Alt+Space')).toBe(false)
    const { textarea } = installComposer()
    textarea.value = '请把旧内容删除'
    textarea.setSelectionRange(2, 5)
    expect(insertVoiceText('新内容')).toBe(true)
    expect(textarea.value).toBe('请把 新内容 删除')
  })

  it('keeps only microphone dictation and its shortcut in companion settings', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      path: '/Users/test/.dsh/AGENTS.md',
      displayPath: '~/.dsh/AGENTS.md',
      exists: true,
      content: '# Global rules\n',
      revision: 'a'.repeat(64),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const setSkin = vi.fn()
    const setSize = vi.fn()
    const setClickAction = vi.fn()
    const setVisible = vi.fn()
    const setShowStatus = vi.fn()
    const setDisplayName = vi.fn()
    const setVoiceShortcut = vi.fn()
    const setLabel = vi.fn()
    render(<ProductCompanionSettings
      useSessions={vi.fn() as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
        voiceEnabled: true, voiceShortcut: 'Alt+Space',
      })) as never}
      actions={{
        ...companionActions(), setSkin, setVisible, setSize, setClickAction, setShowStatus, setDisplayName,
        setVoiceShortcut,
      }}
      t={makeTranslate(zh)}
      close={vi.fn()}
      setLabel={setLabel}
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
    expect(setLabel).toHaveBeenCalledWith('鲸少女')
    fireEvent.click(screen.getByRole('button', { name: '修改名字' }))
    fireEvent.change(screen.getByRole('textbox', { name: '精灵名字' }), {
      target: { value: '小蓝' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存名字' }))
    expect(setDisplayName).toHaveBeenCalledExactlyOnceWith('小蓝')
    fireEvent.click(screen.getByRole('checkbox', { name: '显示鲸少女' }))
    expect(setVisible).toHaveBeenCalledExactlyOnceWith(false)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '启用麦克风听写' }).checked).toBe(true)
    expect(screen.getByText('把浏览器识别出的原文直接放进当前输入框，不调用模型。')).toBeTruthy()
    expect(screen.queryByText('文字处理模型')).toBeNull()
    expect(screen.queryByText('文字处理要求')).toBeNull()
    expect(screen.queryByText('本机累计')).toBeNull()
    const shortcut = screen.getByRole('button', { name: '⌥Space' })
    fireEvent.click(shortcut)
    fireEvent.keyDown(shortcut, { key: 'V', code: 'KeyV', metaKey: true, shiftKey: true })
    expect(setVoiceShortcut).toHaveBeenCalledExactlyOnceWith('Meta+Shift+V')
    expect(screen.queryByRole('checkbox', { name: '跟随当前任务' })).toBeNull()
    expect(screen.queryByRole('button', { name: '恢复默认位置' })).toBeNull()
  })

  it('edits the complete user-global AGENTS.md without project-dependent create or reload actions', async () => {
    const initial = '# Persona\n\n- Keep every conversation direct.\n'
    const saved = '# Persona\n\n- Keep every conversation direct.\n- Prefer concise Chinese.\n'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/api/global-rules') && init?.method === 'PUT') {
        const request = JSON.parse(String(init.body)) as { content: string; revision: string }
        expect(request).toEqual({ content: saved, revision: 'a'.repeat(64) })
        return new Response(JSON.stringify({
          path: '/Users/test/.dsh/AGENTS.md',
          displayPath: '~/.dsh/AGENTS.md',
          exists: true,
          content: request.content,
          revision: 'b'.repeat(64),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/api/global-rules')) {
        return new Response(JSON.stringify({
          path: '/Users/test/.dsh/AGENTS.md',
          displayPath: '~/.dsh/AGENTS.md',
          exists: true,
          content: initial,
          revision: 'a'.repeat(64),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    render(<ProductCompanionSettings
      useSessions={vi.fn() as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', visible: true, position: null, home: 'composer', showStatus: true, autoTravel: true,
        voiceEnabled: false,
      })) as never}
      actions={companionActions()}
      t={makeTranslate(zh)}
      close={vi.fn()}
      setLabel={vi.fn()}
    />)

    const editor = await screen.findByRole('textbox', { name: '编辑全局 AGENTS.md' })
    expect((editor as HTMLTextAreaElement).value).toBe(initial)
    expect(screen.getByText('实时编辑 ~/.dsh/AGENTS.md；保存后从所有对话的下一轮起生效。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重新读取' })).toBeNull()
    expect(screen.queryByRole('button', { name: '创建并保存' })).toBeNull()
    fireEvent.change(editor, { target: { value: saved } })
    expect(screen.getByText('有未保存修改')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => { expect(screen.getByText('已全局生效')).toBeTruthy() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

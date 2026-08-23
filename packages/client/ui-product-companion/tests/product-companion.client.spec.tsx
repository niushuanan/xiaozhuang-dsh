// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ProductCompanion, ProductCompanionSettings, companionFrameUrl } from '../src/client/index.ts'
import { deriveCompanionActivity } from '../src/client/activity.ts'
import { nearestHabitat, nextHabitat } from '../src/client/habitats.ts'
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
  })

  it('turns a click into movement instead of opening a settings panel', () => {
    const setHome = vi.fn()
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
      })) as never}
      actions={{
        setSkin: vi.fn(), setPosition: vi.fn(), setHome,
        setShowStatus: vi.fn(), setAutoTravel: vi.fn(), resetPosition: vi.fn(),
      }}
      t={makeTranslate(zh)}
    />)

    const trigger = screen.getByRole('button', { name: '和小鲸灵互动' })
    expect(trigger.querySelector('img')?.getAttribute('src')).toBe(companionFrameUrl('blue', 'working'))
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(setHome).toHaveBeenCalledExactlyOnceWith('sidebar')
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByText('皮肤')).toBeNull()
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
      actions={{
        setSkin: vi.fn(), setPosition: vi.fn(), setHome: vi.fn(),
        setShowStatus: vi.fn(), setAutoTravel: vi.fn(), resetPosition: vi.fn(),
      }}
      t={makeTranslate(zh)}
    />)

    const root = screen.getByRole('button', { name: '和小鲸灵互动' }).parentElement
    expect(root?.getAttribute('data-state')).toBe('idle')
    expect(root?.getAttribute('data-pose')).toBe('working')
    expect(screen.getByText('在旁边陪你')).toBeTruthy()
  })

  it('cycles through available surfaces and snaps a nearby drop to the real component edge', () => {
    const anchors = {
      sidebar: { x: 30, y: 180 },
      header: { x: 430, y: 28 },
      composer: { x: 760, y: 610 },
    }
    expect(nextHabitat('sidebar', anchors)).toBe('header')
    expect(nextHabitat('header', anchors)).toBe('composer')
    expect(nearestHabitat({ x: 742, y: 600 }, anchors)).toBe('composer')
    expect(nearestHabitat({ x: 300, y: 420 }, anchors)).toBe('free')
  })

  it('snaps a real drag gesture onto the composer habitat', () => {
    const composer = document.createElement('div')
    composer.setAttribute('data-composer-card', '')
    vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
      left: 480, right: 960, top: 620, bottom: 720, width: 480, height: 100,
      x: 480, y: 620, toJSON: () => ({}),
    })
    document.body.append(composer)
    const setHome = vi.fn()
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: false,
      })) as never}
      actions={{
        setSkin: vi.fn(), setPosition: vi.fn(), setHome,
        setShowStatus: vi.fn(), setAutoTravel: vi.fn(), resetPosition: vi.fn(),
      }}
      t={makeTranslate(zh)}
    />)

    const trigger = screen.getByRole('button', { name: '和小鲸灵互动' })
    fireEvent.pointerDown(trigger, { pointerId: 1, button: 0, clientX: 240, clientY: 250 })
    fireEvent.pointerMove(trigger, { pointerId: 1, clientX: 866, clientY: 564 })
    fireEvent.pointerUp(trigger, { pointerId: 1, clientX: 866, clientY: 564 })
    expect(setHome).toHaveBeenCalledExactlyOnceWith('composer')
  })

  it('uses stable same-origin URLs for every generated state frame', () => {
    expect(companionFrameUrl('black', 'sleep'))
      .toBe('/plugins/ui-product-companion/assets/black-sleep.png')
  })

  it('shows real observed task time and preserves it for the completion response', () => {
    vi.useFakeTimers()
    const active = sid('active')
    let current = sessions()
    const useSessions = (selector: (state: SessionListState) => unknown) => selector(current)
    const useStore = (selector: (state: CompanionPreferences) => unknown) => selector({
      skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
    })
    const actions = {
      setSkin: vi.fn(), setPosition: vi.fn(), setHome: vi.fn(),
      setShowStatus: vi.fn(), setAutoTravel: vi.fn(), resetPosition: vi.fn(),
    }
    const { rerender } = render(<ProductCompanion
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      useStore={useStore as never}
      actions={actions}
      t={makeTranslate(zh)}
    />)

    act(() => { vi.advanceTimersByTime(1_500) })
    expect(screen.getByText('正在回应 · 1秒')).toBeTruthy()

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

  it('moves skin and behavior controls into one dedicated settings page', () => {
    const setSkin = vi.fn()
    const setShowStatus = vi.fn()
    const setAutoTravel = vi.fn()
    const resetPosition = vi.fn()
    render(<ProductCompanionSettings
      useSessions={vi.fn() as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({
        skin: 'blue', position: null, home: 'sidebar', showStatus: true, autoTravel: true,
      })) as never}
      actions={{
        setSkin, setPosition: vi.fn(), setHome: vi.fn(),
        setShowStatus, setAutoTravel, resetPosition,
      }}
      t={makeTranslate(zh)}
      close={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('radio', { name: /夜航黑/ }))
    expect(setSkin).toHaveBeenCalledExactlyOnceWith('black')
    fireEvent.click(screen.getByRole('checkbox', { name: '显示任务状态' }))
    expect(setShowStatus).toHaveBeenCalledExactlyOnceWith(false)
    fireEvent.click(screen.getByRole('checkbox', { name: '跟随当前任务' }))
    expect(setAutoTravel).toHaveBeenCalledExactlyOnceWith(false)
    fireEvent.click(screen.getByRole('button', { name: '回到目录旁' }))
    expect(resetPosition).toHaveBeenCalledOnce()
  })
})

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ProductCompanion, companionFrameUrl } from '../src/client/index.ts'
import { deriveCompanionActivity } from '../src/client/activity.ts'
import { zh } from '../src/client/locales.ts'
import type { CompanionPreferences } from '../src/client/store.ts'

afterEach(cleanup)

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

  it('opens its compact status panel and writes the selected skin through its store action', () => {
    const setSkin = vi.fn()
    render(<ProductCompanion
      useSessions={((selector: (state: SessionListState) => unknown) => selector(sessions())) as never}
      useWorkspaces={vi.fn() as never}
      useStore={((selector: (state: CompanionPreferences) => unknown) => selector({ skin: 'blue', position: null })) as never}
      actions={{ setSkin, setPosition: vi.fn(), resetPosition: vi.fn() }}
      t={makeTranslate(zh)}
    />)

    const trigger = screen.getByRole('button', { name: '查看小鲸灵' })
    expect(trigger.querySelector('img')?.getAttribute('src')).toBe(companionFrameUrl('blue', 'working'))
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByRole('region', { name: '小鲸灵' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '鲸夜黑' }))
    expect(setSkin).toHaveBeenCalledExactlyOnceWith('black')
  })

  it('uses stable same-origin URLs for every generated state frame', () => {
    expect(companionFrameUrl('black', 'sleep'))
      .toBe('/plugins/ui-product-companion/assets/black-sleep.png')
  })
})

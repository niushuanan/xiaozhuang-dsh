// @vitest-environment jsdom
import { cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as applyWorkspace, inject as workspaceInject } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { apply as applyMultiWindow, inject as multiWindowInject } from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')

const SID = 'multi-window-session' as SessionId

afterEach(cleanup)
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

type FrameProps = PropsRenderSlots<'sidebar.workspaces'>
function SidebarFrame({ renderSlot }: FrameProps) {
  return <>{renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })}</>
}

describe('multi-window workspace assembly', () => {
  it('adds the fourth action to the native session menu', async () => {
    const runtime = await SlotTestRuntime.create()
    runtime.provide('connection', {
      hostDescription: { getSnapshot: () => undefined, subscribe: () => () => {} },
    })
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.sessions.add({
      id: SID,
      summary: { title: '并行会话', displayTitle: '并行会话', cwd: '/w/parallel' },
      session: {},
    })
    await runtime.workspaces.update((draft) => {
      draft.items = [{
        workspaceId: 'w-parallel' as WorkspaceId,
        title: 'parallel',
        path: '/w/parallel',
        sessionIds: [SID],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }] as never
    })
    await runtime.root.declare(
      { 'sidebar.workspaces': { kind: 'single', scope: 'root' } } as never,
      SidebarFrame as never,
    )
    await runtime.mount({ inject: [...workspaceInject], apply: applyWorkspace })
    await runtime.mount({ inject: [...multiWindowInject], apply: applyMultiWindow })
    const view = runtime.renderRoot()

    const row = (await view.findByText('并行会话')).closest('[role="treeitem"]')!
    fireEvent.click(within(row as HTMLElement).getByLabelText('会话“并行会话”的操作'))
    expect(view.getByRole('menuitem', { name: '已在当前页面', hidden: true })).toBeTruthy()
    await runtime.dispose()
  })
})

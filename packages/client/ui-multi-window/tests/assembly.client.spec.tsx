// @vitest-environment jsdom
import { cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotTestRuntime, TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as applyWorkspace, inject as workspaceInject } from '@deepseek-ai/dsh-client-ui-workspace/client'
import {
  apply as applyMultiWindow, inject as multiWindowInject, requestParentCanOpen,
} from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')

const SID = 'multi-window-session' as SessionId
const CHILD = 'multi-window-child' as SessionId

afterEach(cleanup)
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

type FrameProps = PropsRenderSlots<'sidebar.workspaces'>
function SidebarFrame({ renderSlot }: FrameProps) {
  return <>{renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })}</>
}

describe('multi-window workspace assembly', () => {
  it('waits for the parent pane-limit decision in an auxiliary runtime', async () => {
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation((message) => {
      const requestId = Reflect.get(message as object, 'requestId')
      queueMicrotask(() => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: location.origin,
          source: window.parent,
          data: { type: 'dsh:multi-pane-response', requestId, result: false },
        }))
      })
    })

    await expect(requestParentCanOpen(undefined, 100)).resolves.toBe(false)
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      type: 'dsh:multi-pane-can-open',
    }), location.origin)
  })

  it('adds the fourth action to the native session menu', async () => {
    const runtime = await SlotTestRuntime.create()
    runtime.releaseWorkspaceSource()
    runtime.ctx.provide('connection', {
      generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
    } as never)
    const directoryPicker = {}
    new TestRemote(runtime.ctx, { directoryPicker })
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.ctx.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.sessions.add({
      id: SID,
      summary: { title: '并行会话', displayTitle: '并行会话', cwd: '/w/parallel' },
      session: {},
    })
    await runtime.sessions.add({
      id: CHILD,
      summary: { title: '分叉会话', displayTitle: '分叉会话', cwd: '/w/parallel' },
      session: {},
    })
    runtime.sessions.open(SID)
    await runtime.workspaces.update((draft) => {
      draft.items = [{
        workspaceId: 'w-parallel' as WorkspaceId,
        title: 'parallel',
        path: '/w/parallel',
        sessionIds: [SID, CHILD],
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

    const row = (await view.findByText('分叉会话')).closest('[role="treeitem"]')!
    fireEvent.click(within(row as HTMLElement).getByLabelText('会话“分叉会话”的操作'))
    fireEvent.click(view.getByRole('menuitem', { name: '并排打开', hidden: true }))
    const menuEntry = runtime.slots.entries('sidebar.workspaces.sessionMenuAction')[0]!
    const injected = (menuEntry.inject as () => { coordinator: { getSnapshot: () => { panes: readonly unknown[] } } })()
    const panes = injected.coordinator.getSnapshot().panes
    expect(panes).toHaveLength(1)
    expect(panes[0]).toMatchObject({ sessionId: CHILD })
    expect(typeof (panes[0] as { paneId?: unknown }).paneId).toBe('string')
    await runtime.dispose()
  })
})

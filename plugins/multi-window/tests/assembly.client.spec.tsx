// @vitest-environment jsdom
import { cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
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

type FrameProps = PropsRenderSlots<'sidebar.workspaces' | 'main.conversation'>
function SidebarFrame({ renderSlot }: FrameProps) {
  return <>{renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })}{renderSlot('main.conversation', {})}</>
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
    runtime.ctx.provide('shortcuts', { register: () => () => {}, catalog: createSnapshotStore([]) } as never)
    runtime.ctx.provide('layout', { selectPanel: vi.fn(), beginNavigation: () => new AbortController().signal } as never)
    runtime.ctx.provide('connection', {
      generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
    } as never)
    const directoryPicker = {}
    runtime.remote.provideNamespaces({ directoryPicker })
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
      { 'sidebar.workspaces': { kind: 'single', scope: 'root' }, 'main.conversation': { kind: 'single', scope: 'session-maybe' } } as never,
      SidebarFrame as never,
    )
    await runtime.mount({ inject: [...workspaceInject], apply: applyWorkspace })
    runtime.ctx.uiWorkspace.openSession(SID)
    runtime.ctx.slots.register({ name: 'main.conversation', children: { 'conversation.header': { kind: 'single', scope: 'session' } } } as never, (({ renderSlot }: PropsRenderSlots<'conversation.header'>) => <div data-conversation-scroll=""><span>原对话</span>{renderSlot('conversation.header', {})}</div>) as never)
    runtime.ctx.slots.register({ name: 'conversation.header' } as never, (() => <span>保留标题</span>) as never)
    const feature = await runtime.mount({ inject: [...multiWindowInject], apply: applyMultiWindow })
    expect(runtime.ctx.get('auxiliaryPane')).toBe(runtime.ctx.get('multiPane'))
    const view = runtime.renderRoot()
    expect(view.getByText('原对话')).toBeTruthy()
    expect(view.getByText('保留标题')).toBeTruthy()

    const row = (await view.findByText('分叉会话')).closest('[role="treeitem"]')!
    fireEvent.click(within(row as HTMLElement).getByLabelText('会话“分叉会话”的操作'))
    fireEvent.click(view.getByRole('menuitem', { name: '并排打开', hidden: true }))
    const menuEntry = runtime.slots.entries('sidebar.workspaces.session.menu.item')[0]!
    const injected = (menuEntry.inject as () => { coordinator: { getSnapshot: () => { panes: readonly unknown[] } } })()
    const panes = injected.coordinator.getSnapshot().panes
    expect(panes).toHaveLength(1)
    expect(panes[0]).toMatchObject({ sessionId: CHILD })
    expect(typeof (panes[0] as { paneId?: unknown }).paneId).toBe('string')
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1)
    await feature.dispose()
    expect(view.container.querySelectorAll('iframe')).toHaveLength(0)
    expect(view.getByText('原对话')).toBeTruthy()
    expect(view.getByText('保留标题')).toBeTruthy()
    await runtime.dispose()
  })
})

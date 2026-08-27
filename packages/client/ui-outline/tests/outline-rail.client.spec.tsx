// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  ChatConversationViewNode, ChatNodeStore, ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge (the outline namespace).
import type {} from '../src/client/index.ts'
import { deriveTurns, OutlineRail, type OutlineRailProps } from '../src/client/OutlineRail.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

// Standard locale seat stub mirroring the real ns → common chain (zh default).
const t: OutlineRailProps['t'] = makeTranslate(zh, commonZh)

const sid = (id: string) => id as never

function chatNode(
  key: string,
  kind: string,
  data: unknown,
  turn: number | undefined,
  overrides: Partial<ChatConversationViewNode> = {},
): ChatConversationViewNode {
  return {
    key,
    kind,
    id: key,
    target: 'chat',
    anchorSeq: 0,
    location: turn === undefined ? { kind: 'session' } : { kind: 'turn', turn: turn as never },
    visibility: 'visible',
    data,
    ...overrides,
  }
}

const userNode = (key: string, text: string, turn?: number): ChatConversationViewNode =>
  chatNode(key, 'user', { content: [{ type: 'text', text }] }, turn)

const stepNode = (key: string, text: string, turn: number): ChatConversationViewNode =>
  chatNode(key, 'assistant-step', { status: 'settled', blocks: [{ kind: 'text', text }] }, turn)

const store = (nodes: readonly ChatConversationViewNode[]): ChatNodeStore => {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  return { get: key => byKey.get(key), values: () => nodes }
}

/** Three turns of increasing answer length: weights 0, 1, 2. */
function turnsFixture(): readonly ChatConversationViewNode[] {
  return [
    userNode('u0', '第一轮问题是什么？'),
    stepNode('a1', '这是第一轮的回答内容，比较短。', 0),
    stepNode('a2', '第二轮的回答文本在这里，长度中等，达到中档分档。'.repeat(8), 1),
    stepNode('a3', '第三轮的回答非常长，撑起最长的一档刻度。'.repeat(60), 2),
  ]
}

function railProps(
  nodes: readonly ChatConversationViewNode[],
  overrides: Partial<OutlineRailProps> = {},
  session: { hasMore?: boolean; loadingOlder?: boolean } = {},
): OutlineRailProps {
  const state = {
    chat: { order: nodes.map(node => node.key), nodes: store(nodes) },
    hasMore: session.hasMore ?? false,
    loadingOlder: session.loadingOlder ?? false,
  } as unknown as ConversationSnapshot
  return {
    sessionId: sid('session'),
    useSession: selector => selector(state),
    useProjection: (() => undefined) as never,
    useInput: (() => undefined) as never,
    inputActions: {} as never,
    useSessions: (() => ({})) as never,
    useWorkspaces: (() => ({})) as never,
    loadOlder: vi.fn(),
    t,
    ...overrides,
  }
}

/** Mount inside the seat → column → scrollport structure the rail resolves. */
function mountWithScroller(props: OutlineRailProps): { scroller: HTMLDivElement } {
  const scroller = document.createElement('div')
  scroller.setAttribute('data-conversation-scroll', '')
  const column = document.createElement('div')
  column.append(scroller)
  const seat = document.createElement('div')
  seat.setAttribute('data-slot', 'conversation.session.outline')
  column.append(seat)
  document.body.append(column)
  render(<OutlineRail {...props} />, { container: seat })
  return { scroller }
}

describe('OutlineRail', () => {
  it('derives one turn per location.turn with question, excerpt, and weight', () => {
    const nodes = turnsFixture()
    const turns = deriveTurns({ order: nodes.map(node => node.key), nodes: store(nodes) })
    expect(turns.map(turn => turn.key)).toEqual(['a1', 'a2', 'a3'])
    expect(turns[0]?.question).toBe('第一轮问题是什么？')
    expect(turns[0]?.excerpt).toBe('这是第一轮的回答内容，比较短。')
    expect(turns.map(turn => turn.weight)).toEqual([0, 1, 2])
  })

  it('derives turns without any prompt rows — question stays empty', () => {
    const nodes = [
      stepNode('a1', '第一轮的回答。', 0),
      stepNode('a2', '第二轮的回答。', 1),
      stepNode('a3', '第三轮的回答。', 2),
    ]
    const turns = deriveTurns({ order: nodes.map(node => node.key), nodes: store(nodes) })
    expect(turns.map(turn => turn.key)).toEqual(['a1', 'a2', 'a3'])
    expect(turns.every(turn => turn.question === '')).toBe(true)
  })

  it('skips hidden and session-level nodes when deriving turns', () => {
    const nodes = [
      chatNode('ghost', 'assistant-step', { blocks: [{ kind: 'text', text: '被隐藏的回答。' }] }, 0, { visibility: 'hidden' as never }),
      chatNode('loose', 'context', { content: [] }, undefined),
      stepNode('a1', '第一轮的回答。', 0),
      chatNode('tool', 'tool-call', { root: {} }, 1),
      stepNode('a2', '第二轮的回答。'.repeat(20), 1),
      stepNode('a3', '第三轮的回答。', 2),
    ]
    const turns = deriveTurns({ order: nodes.map(node => node.key), nodes: store(nodes) })
    expect(turns.map(turn => turn.key)).toEqual(['a1', 'tool', 'a3'])
    expect(turns[0]?.excerpt).toBe('第一轮的回答。')
    expect(turns[0]?.weight).toBe(0)
  })

  it('renders nothing below three turns', () => {
    mountWithScroller(railProps(turnsFixture().slice(0, 2)))
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('pages bounded older history while the window is under the turn threshold', () => {
    const props = railProps(turnsFixture().slice(0, 2), {}, { hasMore: true })
    mountWithScroller(props)
    expect(props.loadOlder).toHaveBeenCalledOnce()
    // At or above the threshold the rail never pages.
    const full = railProps(turnsFixture(), {}, { hasMore: true })
    cleanup()
    document.body.innerHTML = ''
    mountWithScroller(full)
    expect(full.loadOlder).not.toHaveBeenCalled()
    // No older history: nothing to page.
    const headReached = railProps(turnsFixture().slice(0, 2), {}, { hasMore: false })
    cleanup()
    document.body.innerHTML = ''
    mountWithScroller(headReached)
    expect(headReached.loadOlder).not.toHaveBeenCalled()
  })

  it('renders one dash per turn with named and unnamed labels', () => {
    mountWithScroller(railProps(turnsFixture()))
    expect(screen.getByRole('navigation', { name: '对话大纲' })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: '跳转到这一轮：第一轮问题是什么？' })).toBeTruthy()
    // A bare second turn without a prompt row falls back to the ordinal label.
    const nodes = [stepNode('a1', '一', 0), stepNode('a2', '二', 1), stepNode('a3', '三', 2)]
    cleanup()
    mountWithScroller(railProps(nodes))
    expect(screen.getByRole('button', { name: '第 2 轮' })).toBeTruthy()
  })

  it('clicking a dash smooth-scrolls the conversation scrollport to the turn row', () => {
    const { scroller } = mountWithScroller(railProps(turnsFixture()))
    for (const key of ['u0', 'a1', 'a2', 'a3']) {
      const row = document.createElement('div')
      row.setAttribute('data-chat-anchor-key', key)
      scroller.append(row)
    }
    scroller.getBoundingClientRect = () => ({
      top: 100, bottom: 700, left: 0, right: 400, width: 400, height: 600,
      x: 0, y: 100, toJSON: () => ({}),
    })
    const rows = [...scroller.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]
    rows.find(row => row.dataset.chatAnchorKey === 'a3')!.getBoundingClientRect = () => ({
      top: 400, bottom: 500, left: 0, right: 400, width: 400, height: 100,
      x: 0, y: 400, toJSON: () => ({}),
    })
    scroller.scrollTo = vi.fn()
    fireEvent.click(screen.getByRole('button', { name: '第 3 轮' }))
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 284, behavior: 'smooth' })
  })

  it('hovering a dash previews the question or the ordinal plus the answer opening', () => {
    mountWithScroller(railProps(turnsFixture()))
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(screen.getByRole('button', { name: '跳转到这一轮：第一轮问题是什么？' }))
    expect(screen.getByRole('tooltip').textContent).toContain('第一轮问题是什么？')
    expect(screen.getByRole('tooltip').textContent).toContain('比较短')
    fireEvent.mouseLeave(screen.getByRole('button', { name: '跳转到这一轮：第一轮问题是什么？' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(screen.getByRole('button', { name: '第 2 轮' }))
    expect(screen.getByRole('tooltip').textContent).toContain('第 2 轮')
    expect(screen.getByRole('tooltip').textContent).toContain('中档分档')
  })
})

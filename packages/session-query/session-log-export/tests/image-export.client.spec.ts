// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  extractConversationMessages, loadCompleteChatSnapshot,
} from '../src/client/image-export.ts'

function chat(overrides: Partial<ChatSnapshot['legacy']> = {}): ChatSnapshot {
  return {
    order: [],
    nodes: { get: () => undefined, values: () => [] },
    locations: { getTurn: () => [], getStep: () => [] },
    navigation: { items: () => [] },
    timeline: { turnOrder: [], turns: new Map() },
    legacy: {
      nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
      ...overrides,
    },
  }
}

describe('conversation image data', () => {
  it('keeps visible questions and answers while excluding reasoning and tools', () => {
    const result = extractConversationMessages(chat({
      nodes: [
        { kind: 'context', seq: 1 },
        { kind: 'user', seq: 2, content: [{ type: 'text', text: '用户问题' }, { type: 'image' }] },
        {
          kind: 'assistant', seq: 3, blocks: [
            { kind: 'reasoning', text: '不应导出的思考' },
            { kind: 'tool-call', name: 'shell' },
            { kind: 'text', text: '最终回答' },
          ],
        },
      ] as never,
      partial: { turn: 2, step: 1, blocks: [{ kind: 'reasoning', text: '隐藏' }, { kind: 'text', text: '正在回答' }] } as never,
    }))

    expect(result).toEqual([
      { role: 'user', text: '用户问题\n【图片】' },
      { role: 'assistant', text: '最终回答' },
      { role: 'assistant', text: '正在回答' },
    ])
    expect(JSON.stringify(result)).not.toContain('不应导出的思考')
    expect(JSON.stringify(result)).not.toContain('shell')
  })

  it('loads every older page before returning the chat target snapshot', async () => {
    const pages = [chat({ nodes: [{ kind: 'user', seq: 3, content: [] }] as never }),
      chat({ nodes: [{ kind: 'user', seq: 2, content: [] }, { kind: 'user', seq: 3, content: [] }] as never }),
      chat({ nodes: [{ kind: 'user', seq: 1, content: [] }, { kind: 'user', seq: 2, content: [] }, { kind: 'user', seq: 3, content: [] }] as never })]
    let index = 0
    const lifecycle = [{ hasMore: true }, { hasMore: true }, { hasMore: false }]
    const session = {
      getSnapshot: () => lifecycle[index],
      loadOlder: vi.fn(async () => { index += 1 }),
    } as unknown as SessionFace
    const source = { getSnapshot: () => pages[index], subscribe: () => () => {} }

    const result = await loadCompleteChatSnapshot(session, source, new AbortController().signal)

    expect(session.loadOlder).toHaveBeenCalledTimes(2)
    expect(result.legacy.nodes).toHaveLength(3)
  })
})

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot, SessionFace, SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  extractConversationMessages, loadCompleteSnapshot,
} from '../src/client/image-export.ts'

const SID = 'session-image-export' as SessionId

function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    sessionId: SID,
    nodes: [],
    partial: null,
    hasMore: false,
    ...overrides,
  } as unknown as ConversationSnapshot
}

describe('conversation image data', () => {
  it('keeps questions and answer text while excluding reasoning, tools, and system rows', () => {
    const result = extractConversationMessages(snapshot({
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
      partial: { turn: 2, step: 1, blocks: [{ kind: 'reasoning', text: '隐藏' }, { kind: 'text', text: '正在回答' }] },
    }))

    expect(result).toEqual([
      { role: 'user', text: '用户问题\n【图片】' },
      { role: 'assistant', text: '最终回答' },
      { role: 'assistant', text: '正在回答' },
    ])
    expect(JSON.stringify(result)).not.toContain('不应导出的思考')
    expect(JSON.stringify(result)).not.toContain('shell')
  })

  it('loads every older page before returning the export snapshot', async () => {
    const pages = [
      snapshot({ nodes: [{ kind: 'user', seq: 3, content: [] }] as never, hasMore: true }),
      snapshot({ nodes: [{ kind: 'user', seq: 2, content: [] }, { kind: 'user', seq: 3, content: [] }] as never, hasMore: true }),
      snapshot({ nodes: [{ kind: 'user', seq: 1, content: [] }, { kind: 'user', seq: 2, content: [] }, { kind: 'user', seq: 3, content: [] }] as never }),
    ]
    let index = 0
    const session = {
      getSnapshot: () => pages[index],
      loadOlder: vi.fn(async () => { index += 1 }),
    } as unknown as SessionFace

    const result = await loadCompleteSnapshot(session, new AbortController().signal)

    expect(session.loadOlder).toHaveBeenCalledTimes(2)
    expect(result.nodes).toHaveLength(3)
  })
})

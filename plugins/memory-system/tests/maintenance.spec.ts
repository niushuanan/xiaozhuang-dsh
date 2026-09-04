import { describe, expect, it, vi } from 'vitest'
import { batchConversationEvidence, collectConversationChanges, maintainMemoryDocument } from '../src/maintenance.ts'

describe('memory maintenance', () => {
  it('collects user and assistant conversation evidence after the successful cursor', async () => {
    const sessionQuery = {
      listSessions: vi.fn(async () => [{ header: { id: 's1', cwd: '/work/dsh' } }]),
      readSurface: vi.fn(async () => ({ events: [
        {
          seq: 2, type: 'assistant/message', time: 120,
          data: {
            turn: 1, step: 1,
            message: {
              role: 'assistant', content: [
                { type: 'tool-call', id: 'call-1', name: 'exec', arguments: '{"cmd":"cat /private/source"}' },
                { type: 'text', text: '建议同步 README' },
              ],
              source: { kind: 'model', provider: 'mock', model: 'mock' },
            },
          },
        },
        {
          seq: 3, type: 'user/message', time: 125,
          data: {
            content: [{ type: 'text', text: '内部系统提示不应该进入记忆' }],
            source: { kind: 'plugin', plugin: 'system-prompt' },
          },
        },
        {
          seq: 4, type: 'user/message', time: 130,
          data: {
            content: [{ type: 'text', text: 'api_key=sk-super-secret' }],
            source: { kind: 'user' },
          },
        },
      ] })),
    }
    const result = await collectConversationChanges(sessionQuery as never, 100, 150)
    expect(sessionQuery.readSurface).toHaveBeenCalledWith('s1')
    expect(result).toEqual([
      { sessionId: 's1', cwd: '/work/dsh', seq: 2, time: 120, role: 'assistant', text: '建议同步 README' },
      { sessionId: 's1', cwd: '/work/dsh', seq: 4, time: 130, role: 'user', text: 'api_key=[已移除敏感信息]' },
    ])
  })

  it('loads one conversation at a time so a large history cannot inflate host memory', async () => {
    let active = 0
    let peak = 0
    const sessionQuery = {
      listSessions: vi.fn(async () => [
        { header: { id: 's1' } },
        { header: { id: 's2' } },
        { header: { id: 's3' } },
      ]),
      readSurface: vi.fn(async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return { events: [] }
      }),
    }

    await collectConversationChanges(sessionQuery as never, 100, 150)

    expect(peak).toBe(1)
  })

  it('writes the model-curated replacement and reports a concise result', async () => {
    const store = {
      read: vi.fn(async () => ({ kind: 'user', content: '旧文档', revision: 'r1' })),
      write: vi.fn(async () => ({ kind: 'user', content: '新文档', revision: 'r2' })),
    }
    const generate = vi.fn(async () => ({ document: '新文档', summary: '更新了发布偏好' }))
    await expect(maintainMemoryDocument({
      store: store as never,
      kind: 'user',
      source: { selectedText: '选择', context: '上下文', sessionId: 's1', sourceType: 'dsh' },
      route: { provider: 'p', model: 'm' },
      generate,
    })).resolves.toEqual({ summary: '更新了发布偏好', changed: true, revision: 'r2' })
    expect(store.write).toHaveBeenCalledWith('user', '新文档', 'r1', 'selection-memory')
  })

  it('does not create a revision when the AI decides the living document is already correct', async () => {
    const store = {
      read: vi.fn(async () => ({ kind: 'ai', content: '保持', revision: 'same' })),
      write: vi.fn(),
    }
    const result = await maintainMemoryDocument({
      store: store as never,
      kind: 'ai',
      source: { conversations: [] },
      route: { provider: 'p', model: 'm' },
      generate: async () => ({ document: '保持', summary: '无需调整' }),
    })
    expect(result).toEqual({ summary: '无需调整', changed: false, revision: 'same' })
    expect(store.write).not.toHaveBeenCalled()
  })

  it('records a committed AI-document replacement as an automatic maintenance revision', async () => {
    const store = {
      read: vi.fn(async () => ({ kind: 'ai', content: '旧文档', revision: 'r1' })),
      write: vi.fn(async () => ({ kind: 'ai', content: '新文档', revision: 'r2' })),
    }
    await maintainMemoryDocument({
      store: store as never,
      kind: 'ai',
      source: { conversations: [{ sessionId: 's1', seq: 1, time: 5, role: 'user' as const, text: '偏好深色主题' }] },
      route: { provider: 'p', model: 'm' },
      generate: async () => ({ document: '新文档', summary: '沉淀了主题偏好' }),
    })
    expect(store.write).toHaveBeenCalledWith('ai', '新文档', 'r1', 'auto-maintenance')
  })

  it('keeps every daily conversation while splitting model requests by evidence size', () => {
    const evidence = [
      { sessionId: 's1', seq: 1, time: 1, role: 'user' as const, text: 'a'.repeat(70) },
      { sessionId: 's1', seq: 2, time: 2, role: 'assistant' as const, text: 'b'.repeat(70) },
      { sessionId: 's2', seq: 1, time: 3, role: 'user' as const, text: 'c'.repeat(70) },
    ]
    const batches = batchConversationEvidence(evidence, 100)
    expect(batches).toHaveLength(3)
    expect(batches.flat().map(item => item.text[0])).toEqual(['a', 'b', 'c'])
  })

  it('keeps default maintenance batches small enough for a complete replacement response', () => {
    const evidence = Array.from({ length: 5 }, (_, index) => ({
      sessionId: 's1',
      seq: index + 1,
      time: index + 1,
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      text: String(index).repeat(12_000),
    }))

    expect(batchConversationEvidence(evidence)).toHaveLength(2)
  })

  it('keeps the beginning and conclusion of an oversized real user message', async () => {
    const sessionQuery = {
      listSessions: vi.fn(async () => [{ header: { id: 's1' } }]),
      readSurface: vi.fn(async () => ({ events: [{
        seq: 1, type: 'user/message', time: 120,
        data: {
          content: [{ type: 'text', text: `BEGIN-${'x'.repeat(20_000)}-END` }],
          source: { kind: 'user' },
        },
      }] })),
    }

    const [result] = await collectConversationChanges(sessionQuery as never, 100, 150)

    expect(result?.text.length).toBeLessThanOrEqual(12_000)
    expect(result?.text).toMatch(/^BEGIN-/u)
    expect(result?.text).toMatch(/-END$/u)
    expect(result?.text).toContain('middle omitted for memory maintenance')
  })
})

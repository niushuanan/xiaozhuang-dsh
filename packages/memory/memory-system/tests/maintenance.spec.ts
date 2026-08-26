import { describe, expect, it, vi } from 'vitest'
import { batchConversationEvidence, collectConversationChanges, maintainMemoryDocument } from '../src/maintenance.ts'

describe('memory maintenance', () => {
  it('collects user and assistant conversation evidence after the successful cursor', async () => {
    const sessionQuery = {
      listSessions: vi.fn(async () => [{ header: { id: 's1', cwd: '/work/dsh' } }]),
      filterEvents: vi.fn(async () => [
        { sessionId: 's1', seq: 2, type: 'assistant/message', time: 120, surface: 'current', text: '建议同步 README' },
        { sessionId: 's1', seq: 3, type: 'user/message', time: 130, surface: 'current', text: 'api_key=sk-super-secret' },
      ]),
    }
    const result = await collectConversationChanges(sessionQuery as never, 100, 150)
    expect(sessionQuery.filterEvents).toHaveBeenCalledWith('s1', [
      { kind: 'time', from: 101, to: 150 },
      { kind: 'type', values: ['user/message', 'assistant/message'] },
      { kind: 'surface', values: ['current'] },
    ])
    expect(result).toEqual([
      { sessionId: 's1', cwd: '/work/dsh', seq: 2, time: 120, role: 'assistant', text: '建议同步 README' },
      { sessionId: 's1', cwd: '/work/dsh', seq: 3, time: 130, role: 'user', text: 'api_key=[已移除敏感信息]' },
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
      filterEvents: vi.fn(async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return []
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
})

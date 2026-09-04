import { Session } from '@deepseek-ai/dsh-session'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  buildDeepSeekImportedSession,
  importDeepSeekHistory,
  parseDeepSeekExportBytes,
  parseDeepSeekExportJson,
} from '../src/deepseek-import.ts'

function officialExport(): string {
  return JSON.stringify([
    {
      id: 'newer',
      title: '较新的对话',
      inserted_at: '2026-08-20T10:00:00.000Z',
      updated_at: '2026-08-20T10:02:00.000Z',
      mapping: {
        root: { id: 'root', parent: null, children: ['u1'], message: null },
        u1: {
          id: 'u1', parent: 'root', children: ['a-current', 'a-old'],
          message: {
            inserted_at: '2026-08-20T10:00:00.000Z', model: null,
            fragments: [{ type: 'REQUEST', content: '现在的答案是什么？' }],
          },
        },
        'a-current': {
          id: 'a-current', parent: 'u1', children: [],
          message: {
            inserted_at: '2026-08-20T10:00:04.000Z', model: 'deepseek-reasoner',
            fragments: [
              { type: 'THINK', content: '先核对官方来源。' },
              { type: 'SEARCH', results: [{ title: 'DeepSeek', url: 'https://www.deepseek.com/' }] },
              { type: 'RESPONSE', content: '这是当前分支。[reference:0]' },
            ],
          },
        },
        'a-old': {
          id: 'a-old', parent: 'u1', children: [],
          message: {
            inserted_at: '2026-08-20T10:00:03.000Z', model: 'deepseek-chat',
            fragments: [{ type: 'RESPONSE', content: '不应导入的重试分支' }],
          },
        },
      },
    },
    {
      id: 'older',
      title: '较早的对话',
      inserted_at: '2026-08-01T09:00:00.000Z',
      updated_at: '2026-08-01T09:01:00.000Z',
      mapping: {
        root: { id: 'root', parent: null, children: ['u1'], message: null },
        u1: {
          id: 'u1', parent: 'root', children: [],
          message: {
            inserted_at: '2026-08-01T09:00:00.000Z', model: null,
            fragments: [{ type: 'REQUEST', content: '更早的问题' }],
          },
        },
      },
    },
  ])
}

describe('DeepSeek history import', () => {
  it('parses the official mapping export in chronological order and keeps only the selected branch', () => {
    const conversations = parseDeepSeekExportJson(officialExport())

    expect(conversations.map(conversation => conversation.title)).toEqual(['较早的对话', '较新的对话'])
    expect(conversations[1]?.messages).toEqual([
      { role: 'user', text: '现在的答案是什么？', time: Date.parse('2026-08-20T10:00:00.000Z') },
      {
        role: 'assistant',
        text: '这是当前分支。[来源 1](https://www.deepseek.com/)',
        reasoning: '先核对官方来源。',
        model: 'deepseek-reasoner',
        time: Date.parse('2026-08-20T10:00:04.000Z'),
      },
    ])
  })

  it('follows current_message_id for the raw DeepSeek API export and ignores regenerated siblings', () => {
    const conversations = parseDeepSeekExportJson(JSON.stringify([{
      id: 'raw-1',
      title: 'Raw export',
      create_time: 1_775_290_400,
      update_time: 1_775_290_500,
      chat_session: { id: 'raw-1', current_message_id: 'a-current', model_type: 'deepseek_reasoner' },
      chat_messages: [
        { message_id: 'u1', parent_id: null, role: 'USER', inserted_at: 1_775_290_400, fragments: [{ type: 'REQUEST', content: '问题' }] },
        { message_id: 'a-old', parent_id: 'u1', role: 'ASSISTANT', inserted_at: 1_775_290_410, fragments: [{ type: 'RESPONSE', content: '旧分支' }] },
        { message_id: 'a-current', parent_id: 'u1', role: 'ASSISTANT', model: 'deepseek-reasoner', inserted_at: 1_775_290_420, fragments: [{ type: 'THINK', content: '思考' }, { type: 'RESPONSE', content: '当前分支' }] },
      ],
    }]))

    expect(conversations[0]?.messages.map(message => message.text)).toEqual(['问题', '当前分支'])
    expect(conversations[0]?.messages[1]).toMatchObject({ reasoning: '思考', model: 'deepseek-reasoner' })
  })

  it('builds a native, continuable chat session log with source timestamps and reasoning blocks', () => {
    const conversation = parseDeepSeekExportJson(officialExport())[1]!
    const imported = buildDeepSeekImportedSession(conversation)

    expect(imported.header).toMatchObject({
      id: expect.stringMatching(/^session-deepseek-/u),
      createdAt: Date.parse('2026-08-20T10:00:00.000Z'),
      agentPreset: 'chat',
      cwd: expect.stringMatching(/^\//u),
    })
    expect(imported.events.map(event => event.type)).toEqual([
      'session/title', 'turn/start', 'step/start', 'user/message',
      'assistant/message', 'step/end', 'turn/end',
    ])
    expect(imported.events.map(event => event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6])
    const assistant = imported.events.find(event => event.type === 'assistant/message')
    expect(assistant?.type === 'assistant/message' && assistant.data.message.content).toEqual([
      { type: 'reasoning', text: '先核对官方来源。' },
      { type: 'text', text: '这是当前分支。[来源 1](https://www.deepseek.com/)' },
    ])
    expect(assistant?.time).toBe(Date.parse('2026-08-20T10:00:04.000Z'))
    expect(() => Session.create(imported.header.id, imported.events, imported.header)).not.toThrow()
  })

  it('rejects unrelated JSON instead of creating empty or misleading sessions', () => {
    expect(() => parseDeepSeekExportJson('{"messages":[]}')).toThrow('DeepSeek')
    expect(() => parseDeepSeekExportJson('[]')).toThrow('DeepSeek')
  })

  it('finds the official conversation JSON inside a DeepSeek ZIP export', () => {
    const archive = zipSync({
      'metadata.json': strToU8('{"exported":true}'),
      'deepseek/conversations.json': strToU8(officialExport()),
    })

    expect(parseDeepSeekExportBytes(archive, 'deepseek-export.zip').map(item => item.title))
      .toEqual(['较早的对话', '较新的对话'])
  })

  it('writes imported sessions durably, skips stable duplicates, and reports per-conversation failures', async () => {
    const conversations = parseDeepSeekExportJson(officialExport())
    const duplicate = buildDeepSeekImportedSession(conversations[1]!).header.id
    const created: string[] = []
    const appended: string[] = []
    const persistence = {
      list: async () => [{ header: { id: duplicate } }],
      create: async (header: { id: string }) => {
        created.push(header.id)
        return {
          append: async () => {
            appended.push(header.id)
            if (header.id === buildDeepSeekImportedSession(conversations[0]!).header.id) throw new Error('disk full')
          },
          flush: async () => {},
          close: async () => {},
        }
      },
    }

    const result = await importDeepSeekHistory(persistence as never, conversations)

    expect(result).toMatchObject({ imported: 0, skipped: 1, failed: 1 })
    expect(created).toHaveLength(1)
    expect(appended).toEqual(created)
    expect(result.errors[0]).toContain('较早的对话')
  })
})

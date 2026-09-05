import { describe, expect, it } from 'vitest'
import { sessionFormatCatalog } from '../src/index.ts'

const header = { type: 'session', version: 0, id: 'legacy-correlations', createdAt: 1, delegationDepth: 0 }

function migrate(rows: readonly unknown[]) {
  return sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(header, rows))
}

describe('pre-correlation v0 history', () => {
  it('restores the recorded compaction bracket and its checkpoint without changing content or references', () => {
    const rows = [
      {
        type: 'user/message', seq: 0, time: 1,
        data: { id: 'user', role: 'user', content: [{ type: 'text', text: 'Original question' }], source: { kind: 'user' } },
        surfaceOp: 'append',
      },
      { type: 'compact/start', seq: 1, time: 2, data: { turn: null } },
      {
        type: 'compact/summary', seq: 2, time: 3,
        data: {
          summary: [{ type: 'text', text: 'Retained summary' }], shadowedRange: { start: 0, end: 0 },
          shadowedSeqs: [0], shadowedTokenCount: 100, provider: 'p', model: 'm',
        },
      },
      {
        type: 'user/message', seq: 3, time: 4,
        data: {
          id: 'checkpoint', role: 'user', content: [{ type: 'text', text: 'Retained checkpoint' }],
          source: { kind: 'plugin', plugin: 'compact' },
        },
        sourceEventSeqs: [1, 2, 0], surfaceOp: { op: 'replace', start: 0, end: 0 },
      },
      { type: 'compact/end', seq: 4, time: 5, data: { turn: null } },
    ]
    const before = structuredClone(rows)
    const events = migrate(rows).events
    const compactionId = 'legacy-compaction:legacy-correlations:1'
    expect(events.map(event => event.type)).toEqual([
      'user/message', 'compaction/start', 'compaction/summary', 'user/message', 'compaction/end',
    ])
    expect(events[0]).toEqual(rows[0])
    expect(events[2]?.data).toEqual({ ...rows[2]?.data, compactionId })
    expect(events[3]).toEqual({
      ...rows[3], data: { ...rows[3]?.data, source: { kind: 'plugin', plugin: 'compact', compactionId } },
    })
    expect(events[4]?.data).toEqual({ turn: null, compactionId })
    expect(rows).toEqual(before)
    expect(() => migrate(rows.map((row, index) => index === 3 ? { ...row, sourceEventSeqs: [2, 0] } : row)))
      .toThrow(/checkpoint.*recorded compaction/)
  })

  it('correlates legacy retries by their recorded policy chain without inventing retry-started events', () => {
    const retry = (seq: number, turn: number, attempt: number) => ({
      type: 'llm/retry', seq, time: seq + 1,
      data: {
        turn, step: 1, provider: 'p', mode: 'normal', policyKey: 'policy', retry: attempt,
        maxRetries: 2, delayMs: 500, failure: { code: 'TRANSPORT', message: 'Connection failed' },
      },
    })
    const rows = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'step/start', seq: 1, time: 2, data: { turn: 1, step: 1 } },
      { type: 'request/header', seq: 2, time: 3, data: { header: { config: { provider: 'p', model: 'm' } }, reason: 'initial' } },
      retry(3, 1, 1), retry(4, 1, 2),
      { type: 'step/end', seq: 5, time: 6, data: { turn: 1, step: 1 } },
      { type: 'turn/end', seq: 6, time: 7, data: { turn: 1, reason: { kind: 'completed' } } },
      { type: 'turn/start', seq: 7, time: 8, data: { turn: 2 } },
      { type: 'step/start', seq: 8, time: 9, data: { turn: 2, step: 1 } },
      retry(9, 2, 1),
    ]
    const before = structuredClone(rows)
    const events = migrate(rows).events
    expect(events.filter(event => event.type === 'llm/retry').map(event => event.data)).toEqual([
      { ...rows[3]?.data, retryId: 'legacy-retry:legacy-correlations:3' },
      { ...rows[4]?.data, retryId: 'legacy-retry:legacy-correlations:3' },
      { ...rows[9]?.data, retryId: 'legacy-retry:legacy-correlations:9' },
    ])
    expect(events.some(event => event.type === 'llm/retry-started')).toBe(false)
    expect(rows).toEqual(before)
    expect(() => migrate(rows.map((row, index) => index === 4 ? retry(4, 1, 4) : row))).toThrow(/retry/)
  })
})

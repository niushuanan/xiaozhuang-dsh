import { describe, expect, it } from 'vitest'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { sessionFormatCatalog } from '../src/index.ts'

describe('first-party Session format catalog', () => {
  it.each([0, 1])('retains format v%s permission origin without changing execution knobs', (version) => {
    const header = { type: 'session', version, id: 'permission-origin', createdAt: 1, delegationDepth: 0 }
    const rows = [
      { type: 'permission/preset', seq: 0, time: 1, data: { preset: 'danger-full-access', origin: 'default' } },
      { type: 'sandbox/mode', seq: 1, time: 1, data: { mode: 'danger-full-access' } },
      { type: 'approval/policy', seq: 2, time: 1, data: { policy: 'never' } },
      { type: 'permission/preset', seq: 3, time: 2, data: { preset: 'read-only', origin: 'selection' } },
      { type: 'sandbox/mode', seq: 4, time: 2, data: { mode: 'read-only' } },
      { type: 'approval/policy', seq: 5, time: 2, data: { policy: 'ask' } },
    ]
    const migrated = sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(header, rows))
    expect(migrated.events).toEqual(rows)
    expect(() => sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(header, [{
      ...rows[0], data: { preset: 'read-only', origin: 'unknown' },
    }]))).toThrow(/origin/)
  })

  it.each([0, 1])('restores format v%s descriptor v2 as the same continuable child composition in v3', (version) => {
    const header = { type: 'session', version, id: 'descriptor-v2', createdAt: 1, delegationDepth: 0 }
    const data = {
      version: 2, mode: 'continuable', provider: 'spawn', label: 'Research',
      agentProvider: 'mock', agentModel: 'mock', persona: 'Research carefully', toolFilter: { allow: ['read'] },
    }
    const rows = [{ type: 'subagent/descriptor', seq: 0, time: 1, data }]
    const migrated = sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(header, rows))
    expect(foldSubagentDescriptor(migrated.events as SessionEvent[])).toEqual({ ...data, version: 3 })
    expect(rows[0]?.data.version).toBe(2)
    expect(() => sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(header, [{
      ...rows[0], data: { ...data, agentReasoningEffort: 'high' },
    }]))).toThrow(/agentReasoningEffort/)
  })

  it('statically owns the complete adjacent v0 to v2 chain', () => {
    const header = {
      type: 'session',
      version: 0,
      id: 'catalog',
      createdAt: 1,
      seedLength: 0,
      delegationDepth: 0,
    }

    expect(sessionFormatCatalog.currentVersion).toBe(2)
    expect(sessionFormatCatalog.readHeader(header)).toEqual({
      status: 'migration-required',
      storedVersion: 0,
      targetVersion: 2,
      header: {
        version: 2,
        id: 'catalog',
        createdAt: 1,
        isSeeded: true,
        delegationDepth: 0,
      },
    })

    const v1Header = { ...header, version: 1 }
    const current = sessionFormatCatalog.decodeArtifact(v1Header, [
      { type: 'turn/start', seq: 0, time: 2, data: { turn: 1 } },
    ])
    expect(sessionFormatCatalog.migrate(current)).toMatchObject({
      header: { version: 2, id: 'catalog' },
    })
  })

  it('restores the installed current vocabulary without freezing ordinary payload additions', () => {
    const header = {
      type: 'session', version: 2, id: 'current-growth', createdAt: 1, isSeeded: false, delegationDepth: 0,
    }
    const extended = sessionFormatCatalog.decodeArtifact(header, [{
      type: 'turn/start', seq: 0, time: 1, data: { turn: 1, postReleaseMember: true },
    }])
    expect(sessionFormatCatalog.migrate(extended).events).toEqual(extended.events)

    const unknownRequired = sessionFormatCatalog.decodeArtifact(header, [{
      type: 'ordinary/not-installed', seq: 0, time: 1, data: 'future',
    }])
    expect(() => sessionFormatCatalog.migrate(unknownRequired)).toThrow(/unknown event type/)

    const extension = sessionFormatCatalog.decodeArtifact(header, [{
      type: 'ordinary/external', seq: 0, time: 1, data: null, ignorable: true,
    }])
    expect(sessionFormatCatalog.migrate(extension).events).toEqual([{
      type: 'ordinary/external', seq: 0, time: 1, data: null, ignorable: true,
    }])
  })
})

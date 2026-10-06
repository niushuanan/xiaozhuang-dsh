import { describe, expect, it } from 'vitest'
import { isSessionFormatJsonObject, registerSessionFormatStateCompatibility } from '@deepseek-ai/dsh-session-format'
import { createSessionFormatCatalogWithChildren } from '../src/index.ts'

function restore(version: number, row: object) {
  const reader = createSessionFormatCatalogWithChildren([]).createRestore({
    type: 'session', version, id: 'legacy-state', createdAt: 1, delegationDepth: 0,
    ...(version >= 2 ? { isSeeded: false } : {}),
  }, { recovery: 'strict', validation: 'current' })
  reader.decodeRow(row)
  return reader.finish()
}

const state = { type: 'teamwork/state', seq: 0, time: 2, data: { active: true } }

describe('declared historical plugin state', () => {
  it('preserves the Teamwork switch through every historical entry into v4', () => {
    const dispose = registerSessionFormatStateCompatibility({
      type: state.type, fromVersion: 0, toVersion: 4,
      accepts: data => isSessionFormatJsonObject(data)
        && Object.keys(data).length === 1 && typeof data['active'] === 'boolean',
    })
    try {
      for (const version of [0, 1, 2, 3]) {
        const result = restore(version, state)
        expect(result.header.version).toBe(4)
        expect(result.events).toEqual([{ ...state, ignorable: true }])
      }
      expect(() => restore(0, { ...state, data: { active: 'yes' } })).toThrow('unsupported historical state')
      expect(() => restore(0, { ...state, surfaceOp: 'append' })).toThrow('unsupported historical state')
      expect(() => restore(0, { ...state, type: 'unregistered/state', ignorable: true })).toThrow('unknown')
    } finally { dispose() }
    expect(() => restore(0, state)).toThrow('unknown')
  })
})

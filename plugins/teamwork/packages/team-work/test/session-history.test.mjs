import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { apply, foldTeamwork } from '../src/index.js'

function mountTeamwork() {
  const effects = []
  apply({
    get: () => undefined,
    effect: install => { effects.push(install()) },
    inject() {},
    on() {},
    systemPrompt: { context() {} },
  })
  return () => { for (const dispose of effects.reverse()) dispose?.() }
}

function header(version) {
  return { type: 'session', version, id: 'legacy-teamwork', createdAt: 1, delegationDepth: 0 }
}

test('migrates the unmarked historical Teamwork switch and reads the successor after unplugging', () => {
  const unplug = mountTeamwork()
  const rows = [
    { type: 'permission/preset', seq: 0, time: 1, data: { preset: 'read-only' } },
    { type: 'sandbox/mode', seq: 1, time: 1, data: { mode: 'read-only' } },
    { type: 'approval/policy', seq: 2, time: 1, data: { policy: 'ask' } },
    { type: 'teamwork/state', seq: 3, time: 1, data: { active: false } },
    { type: 'subagent/model-selection-policy', seq: 4, time: 1, data: {
      allowedModels: [{ provider: 'mock', model: 'mock' }],
    } },
  ]
  const original = structuredClone(rows)
  let migrated
  try {
    migrated = sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(header(0), rows))
    assert.equal(migrated.header.version, 2)
    assert.deepEqual(migrated.events[3], { ...rows[3], ignorable: true })
    assert.deepEqual(rows, original)
  } finally {
    unplug()
  }
  const encoded = sessionFormatCatalog.encodeCurrent(migrated)
  const reopened = sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(encoded.header, encoded.rows))
  assert.deepEqual(foldTeamwork(reopened.events), { active: false, explicit: true })
  assert.throws(() => sessionFormatCatalog.decodeArtifact(header(0), rows), /unknown historical event/)
})

for (const version of [0, 1]) {
  test(`preserves Teamwork state and ordering while format v${version} collapses Assistant chunks`, () => {
    const unplug = mountTeamwork()
    const rows = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'step/start', seq: 1, time: 2, data: { turn: 1, step: 1 } },
      { type: 'assistant/chunk', seq: 2, time: 3, data: {
        turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'hello' },
      } },
      { type: 'teamwork/state', seq: 3, time: 4, data: { active: true } },
      { type: 'assistant/chunk', seq: 4, time: 5, data: {
        turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'stop' } },
      } },
      { type: 'assistant/message', seq: 5, time: 6, sourceEventSeqs: [2, 4], surfaceOp: 'append', data: {
        turn: 1, step: 1, message: {
          id: 'reply', role: 'assistant', content: [{ type: 'text', text: 'hello' }],
          source: { kind: 'model', provider: 'mock', model: 'mock' },
        },
      } },
      { type: 'step/end', seq: 6, time: 7, data: { turn: 1, step: 1 } },
      { type: 'turn/end', seq: 7, time: 8, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    try {
      const migrated = sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(header(version), rows))
      assert.deepEqual(migrated.events.map(event => [event.type, event.seq]), [
        ['turn/start', 0], ['step/start', 1], ['teamwork/state', 2],
        ['assistant/message', 3], ['step/end', 4], ['turn/end', 5],
      ])
      assert.deepEqual(migrated.events[2], {
        type: 'teamwork/state', seq: 2, time: 4, data: { active: true }, ignorable: true,
      })
      assert.deepEqual(foldTeamwork(migrated.events), { active: true, explicit: true })
      assert.deepEqual(migrated.events[3].data.message.content, [{ type: 'text', text: 'hello' }])
    } finally {
      unplug()
    }
  })
}

test('refuses undeclared required events and unsupported Teamwork payloads', () => {
  const unplug = mountTeamwork()
  try {
    for (const event of [
      { type: 'unknown/required', data: { active: true } },
      { type: 'teamwork/state', data: { active: true, sourceSeq: 99 } },
    ]) {
      assert.throws(() => sessionFormatCatalog.migrate(sessionFormatCatalog.decodeArtifact(header(0), [
        { ...event, seq: 0, time: 1 },
      ])), /unknown historical event|unsupported historical state/)
    }
  } finally {
    unplug()
  }
})

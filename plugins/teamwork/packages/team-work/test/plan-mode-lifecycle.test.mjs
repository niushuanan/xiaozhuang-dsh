import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, foldTeamwork } from '../lib/index.js'

function fixture() {
  const listeners = new Map()
  const agentsById = new Map()
  const planCalls = []
  const projections = []
  const commands = new Map()
  const policies = []
  const providers = new Map()
  const ownership = new Set()
  const planMode = {
    set(agent, active) {
      planCalls.push([agent.id, active])
    },
  }
  const services = {
    agents: {
      get: id => agentsById.get(id),
      list: () => [...agentsById.values()],
      isOwnedBy: (childId, parent) => ownership.has(`${parent.id}:${childId}`),
    },
    subagents: {
      getProvider: name => providers.get(name),
    },
    agentPresets: {
      serviceFor: () => planMode,
    },
    planMode,
    sessionProjections: {
      register(definition) {
        projections.push(definition)
      },
    },
    commands: {
      register(definition) {
        commands.set(definition.name, definition)
      },
    },
  }
  const ctx = {
    get: name => services[name],
    systemPrompt: { context(policy) { policies.push(policy) } },
    effect() {},
    inject(_names, handler) {
      handler(services)
    },
    on(name, handler) {
      const entries = listeners.get(name) ?? []
      entries.push(handler)
      listeners.set(name, entries)
    },
  }

  apply(ctx)

  const runtime = {
    agentsById,
    planCalls,
    projections,
    commands,
    policies,
    providers,
    ownership,
    emit(name, ...args) {
      for (const handler of listeners.get(name) ?? []) handler(...args, () => undefined)
    },
    async run(name, ...args) {
      let result
      for (const handler of listeners.get(name) ?? []) {
        result = await handler(...args, () => ({ kind: 'accept', messages: [] }))
      }
      return result
    },
    session(id, initial = []) {
      const session = {
        id,
        events: [...initial],
        snapshotEvents() {
          return Object.freeze([...session.events])
        },
        append(type, data) {
          const event = { type, data }
          session.events.push(event)
          runtime.emit('session/event', session, event)
          return event
        },
        appendExternal(type, data) {
          return session.append(type, data)
        },
      }
      return session
    },
  }
  return runtime
}

test('projects Teamwork independently from permission changes', () => {
  const runtime = fixture()
  const projection = runtime.projections.find(candidate => candidate.key === 'teamwork')
  assert.ok(projection)

  let state = projection.init()
  state = projection.apply(state, { type: 'permission/preset', data: { preset: 'danger-full-access' } })
  state = projection.apply(state, { type: 'teamwork/state', data: { active: true } })
  state = projection.apply(state, { type: 'permission/preset', data: { preset: 'read-only' } })

  assert.deepEqual(projection.wire.view(state), { active: true })
})

test('the Teamwork command never writes a permission preset and permission switches preserve it', () => {
  const runtime = fixture()
  const session = runtime.session('session-command', [
    { type: 'permission/preset', data: { preset: 'danger-full-access' } },
  ])
  const agent = { id: session.id, session }
  runtime.agentsById.set(agent.id, agent)
  runtime.emit('agent/created', { agent })

  const command = runtime.commands.get('teamwork')
  assert.ok(command)
  assert.deepEqual(command.handler({ agent, rawInput: 'on' }), { kind: 'success', text: 'Teamwork on' })
  assert.equal(session.events.at(-1).type, 'teamwork/state')
  assert.equal(session.events.filter(event => event.type === 'permission/preset').length, 1)
  assert.deepEqual(runtime.planCalls, [[session.id, true]])

  session.append('permission/preset', { preset: 'read-only' })
  assert.equal(foldTeamwork(session.events).active, true)
  assert.deepEqual(runtime.planCalls, [[session.id, true]])

  assert.deepEqual(command.handler({ agent, rawInput: 'off' }), { kind: 'success', text: 'Teamwork off' })
  assert.deepEqual(runtime.planCalls, [[session.id, true], [session.id, false]])
})

test('migrates a legacy team-work permission selection without changing its permission log', () => {
  const runtime = fixture()
  const session = runtime.session('session-legacy', [
    { type: 'permission/preset', data: { preset: 'team-work' } },
    { type: 'sandbox/mode', data: { mode: 'workspace-write' } },
    { type: 'approval/policy', data: { policy: 'ask' } },
  ])
  const agent = { id: session.id, session }
  runtime.agentsById.set(agent.id, agent)
  runtime.emit('agent/created', { agent })

  assert.deepEqual(session.events.at(-1), { type: 'teamwork/state', data: { active: true } })
  assert.equal(session.events.filter(event => event.type === 'permission/preset').length, 1)
  assert.deepEqual(runtime.planCalls, [[session.id, true]])

  session.append('permission/preset', { preset: 'read-only' })
  assert.equal(foldTeamwork(session.events).active, true)
})

test('activates plan mode at the first pre-step when creation notification was missed', async () => {
  const runtime = fixture()
  const session = runtime.session('session-first-step', [
    { type: 'teamwork/state', data: { active: true } },
  ])
  const agent = { id: session.id, session }
  runtime.agentsById.set(agent.id, agent)

  await runtime.run('agent/pre-step', { agent, signal: new AbortController().signal })

  assert.deepEqual(runtime.planCalls, [[session.id, true]])
})

test('lists only external experts whose Providers are currently callable', () => {
  const runtime = fixture()
  const session = runtime.session('session-roster', [
    { type: 'teamwork/state', data: { active: true } },
  ])
  const agent = { id: session.id, session }
  const policy = runtime.policies.find(candidate => candidate.name === 'teamwork:policy')
  assert.ok(policy)

  assert.doesNotMatch(policy.text({ agent }), /subagent_codex|subagent_zcode/)
  runtime.providers.set('codex', { name: 'codex' })
  assert.match(policy.text({ agent }), /Codex via subagent_codex/)
  assert.doesNotMatch(policy.text({ agent }), /subagent_zcode/)
  runtime.providers.set('zcode', { name: 'zcode' })
  assert.match(policy.text({ agent }), /Z Code via subagent_zcode/)
  runtime.providers.delete('codex')
  assert.doesNotMatch(policy.text({ agent }), /subagent_codex/)
})

test('applies the root Teamwork concurrency cap to a nested native child', async () => {
  const runtime = fixture()
  const rootSession = runtime.session('root', [
    { type: 'teamwork/state', data: { active: true } },
  ])
  const root = { id: rootSession.id, session: rootSession, status: 'running' }
  runtime.agentsById.set(root.id, root)

  let caller
  for (let index = 0; index < 5; index += 1) {
    const session = runtime.session(`child-${index}`)
    const child = { id: session.id, session, status: 'running' }
    runtime.agentsById.set(child.id, child)
    runtime.ownership.add(`${root.id}:${child.id}`)
    if (index === 0) caller = child
  }

  const result = await runtime.run('tools/pre-execute', {
    name: 'subagent_zcode',
    agent: caller,
  })
  assert.deepEqual(result, {
    kind: 'deny',
    reason: 'Team Work concurrency cap: 5 subagents are already running (max 5). Wait for one to settle before starting another.',
  })
})

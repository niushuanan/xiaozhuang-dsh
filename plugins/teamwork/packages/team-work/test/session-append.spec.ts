import { describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { apply, foldTeamwork } from '../src/index.js'

describe('Teamwork with the target Session append API', () => {
  it('restores, creates and toggles a real session with an ordered independent state log', () => {
    const restored = { id: SessionId('restored'), session: Session.create(SessionId('restored')) }
    const fresh = { id: SessionId('fresh'), session: Session.create(SessionId('fresh')) }
    const listeners = new Map<string, Function>()
    const commands = new Map<string, any>()
    const disposers: any[] = []
    const services: any = {
      agents: { list: () => [restored], get: () => undefined },
      commands: { register: (definition: any) => commands.set(definition.name, definition) },
      sessionProjections: { register() {} },
    }
    apply({
      get: (name: string) => services[name],
      inject: (_names: string[], install: Function) => install(services),
      effect: (install: Function) => { disposers.push(install()) },
      on: (name: string, handler: Function) => { listeners.set(name, handler) },
      systemPrompt: { context() {} },
    })
    try {
      expect(foldTeamwork(restored.session.snapshotEvents())).toEqual({ active: false, explicit: true })
      listeners.get('agent/created')!({ agent: fresh })
      const handler = commands.get('teamwork').handler
      expect(handler({ agent: fresh, rawInput: 'on' }).kind).toBe('success')
      expect(handler({ agent: fresh, rawInput: 'off' }).kind).toBe('success')
      expect(fresh.session.snapshotEvents().map(event => ({ type: event.type, seq: event.seq, data: event.data }))).toEqual([
        { type: 'teamwork/state', seq: 0, data: { active: false } },
        { type: 'teamwork/state', seq: 1, data: { active: true } },
        { type: 'teamwork/state', seq: 2, data: { active: false } },
      ])
      expect(fresh.session.snapshotEvents().every(event => event.ignorable === true)).toBe(true)
      expect(foldTeamwork(fresh.session.snapshotEvents())).toEqual({ active: false, explicit: true })
    } finally { for (const dispose of disposers.reverse()) dispose?.() }
  })
})

import { Context } from '@deepseek-ai/cordis'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { registerSessionFormatStateCompatibility } from '@deepseek-ai/dsh-session-format'
import { compressZstdFrame } from '../../../../../packages/session/session-persistence-jsonl/src/zstd.ts'
import { generationLogPath } from '../../../../../packages/session/session-persistence-jsonl/src/format.ts'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

it.each(['none', 'zstd'] as const)('reads declared unmarked V4 state and persists marked state through JSONL %s', async compression => {
  const root = await mkdtemp(join(tmpdir(), 'teamwork-current-jsonl-'))
  const ctx = new Context()
  const release = registerSessionFormatStateCompatibility({ type: 'teamwork/state', fromVersion: 0, toVersion: 4,
    accepts: data => data !== null && typeof data === 'object' && !Array.isArray(data)
      && Object.keys(data).length === 1 && typeof data.active === 'boolean' })
  try {
    await ctx.plugin(JsonlPersistence, { root, compression })
    const id = SessionId('legacy-unmarked-current')
    const path = generationLogPath(root, undefined, id, 4, compression)
    const header = { type: 'session', version: 4, id, createdAt: 1, isSeeded: false, delegationDepth: 0 }
    const event = { type: 'teamwork/state', seq: 0, time: 1, data: { active: true } }
    const original = JSON.stringify(header) + '\n' + JSON.stringify(event) + '\n'
    await mkdir(dirname(path), { recursive: true })
    const originalBytes = compression === 'none' ? Buffer.from(original) : Buffer.concat([await compressZstdFrame(JSON.stringify(header) + '\n'), await compressZstdFrame(JSON.stringify(event) + '\n')])
    await writeFile(path, originalBytes)
    const handle = await ctx.sessionPersistence.open(id, 'read')
    const loaded = await handle.read()
    expect(loaded.events[0]).toMatchObject({ ...event, ignorable: true })
    await handle.close()
    expect(await readFile(path)).toEqual(originalBytes)
    const fresh = Session.create(SessionId('new-marked-current'))
    fresh.append('teamwork/state', { active: false }, { ignorable: true })
    const writer = await ctx.sessionPersistence.create(fresh.header)
    await writer.append([...fresh.snapshotEvents()])
    await writer.flush()
    await writer.close()
    const reopened = await ctx.sessionPersistence.open(fresh.id, 'read')
    expect((await reopened.read()).events[0]).toMatchObject({ type: 'teamwork/state', ignorable: true, data: { active: false } })
    await reopened.close()
    const badId = SessionId('unknown-current')
    const badPath = generationLogPath(root, undefined, badId, 4, compression)
    await mkdir(dirname(badPath), { recursive: true })
    const bad = JSON.stringify({ ...header, id: badId }) + '\n' + JSON.stringify({ ...event, type: 'unknown/required' }) + '\n'
    await writeFile(badPath, compression === 'none' ? Buffer.from(bad) : Buffer.concat([await compressZstdFrame(JSON.stringify({ ...header, id: badId }) + '\n'), await compressZstdFrame(JSON.stringify({ ...event, type: 'unknown/required' }) + '\n')]))
    await expect(ctx.sessionPersistence.open(badId, 'read')).rejects.toThrow(/unknown|not marked/)
  } finally { release(); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

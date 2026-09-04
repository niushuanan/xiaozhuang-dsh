/** The removable plugin facade stays aligned with the target DSH exporter. */

import {
  SESSION_FORMAT_VERSION,
  SessionLogOffset,
  SessionSeq,
  type SessionEvent,
  type SessionHeader,
  type SessionId,
} from '@deepseek-ai/dsh-session'
import {
  SessionPersistenceNotFoundError,
  type SessionHandle,
} from '@deepseek-ai/dsh-session-persistence'
import { describe, expect, it } from 'vitest'
import {
  readSessionLogText,
  serializeSessionLog,
  SESSION_LOG_FILENAME,
} from '../src/archive.ts'

const sid = (value: string): SessionId => value as SessionId

function storedSession(id: string): {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
} {
  return {
    header: {
      version: SESSION_FORMAT_VERSION,
      id: sid(id),
      createdAt: 1,
      cwd: '/workspace',
      isSeeded: false,
      delegationDepth: 0,
    },
    events: [{
      type: 'turn/start',
      seq: SessionSeq(0),
      time: 2,
      data: { turn: 1 },
    }],
  }
}

describe('target session-log export facade', () => {
  it('reads through the current persistence handle and emits canonical JSONL', async () => {
    const stored = storedSession('session-1')
    let closed = false
    const handle = {
      id: stored.header.id,
      header: stored.header,
      access: 'read',
      inheritedEventCount: SessionLogOffset(0),
      read: async () => stored.events,
      close: async () => { closed = true },
    } as unknown as SessionHandle
    const persistence = { open: async () => handle }

    const text = await readSessionLogText(persistence as never, stored.header.id)

    expect(text).toBe(serializeSessionLog(stored.header, stored.events))
    expect(text).toContain('"id":"session-1"')
    expect(closed).toBe(true)
    expect(SESSION_LOG_FILENAME).toMatch(/^session(?:\.v\d+)?\.jsonl$/u)
  })

  it('preserves the upstream missing-session result', async () => {
    const id = sid('missing')
    const persistence = {
      open: async () => { throw new SessionPersistenceNotFoundError(id) },
    }

    await expect(readSessionLogText(persistence as never, id)).resolves.toBeUndefined()
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ChatStarter } from '../src/client/start-chat.ts'

const sid = (id: string) => id as SessionId

function state(rows: Record<string, SessionSummary>): SessionListState {
  return {
    ids: Object.keys(rows).map(sid), byId: rows, current: undefined, phase: 'ready',
    subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }
}

describe('ChatStarter', () => {
  it('reuses a blank chat and coalesces creation and preset selection', async () => {
    let list = state({
      [sid('blank')]: {
        id: sid('blank'), displayTitle: 'blank', blank: true, running: false,
        updatedAt: 1, projectionValues: { agentPreset: 'chat' },
      },
    })
    const open = vi.fn()
    let resolveCreate!: (id: SessionId) => void
    const create = vi.fn(() => new Promise<SessionId>((resolve) => { resolveCreate = resolve }))
    const select = vi.fn(async () => ({ ok: true, value: 'chat' } as const))
    const starter = new ChatStarter(
      { list: { getSnapshot: () => list, subscribe: () => () => {} }, create, open },
      { agentPresets: { select } } as unknown as Pick<ClientRemote, 'agentPresets'>,
    )

    starter.start()
    expect(open).toHaveBeenCalledWith(sid('blank'))
    expect(create).not.toHaveBeenCalled()

    list = state({})
    starter.start()
    starter.start()
    expect(create).toHaveBeenCalledOnce()
    resolveCreate(sid('fresh'))
    await vi.waitFor(() => { expect(select).toHaveBeenCalledWith(sid('fresh'), 'chat') })
    await vi.waitFor(() => { expect(open).toHaveBeenCalledWith(sid('fresh')) })
    expect(select).toHaveBeenCalledOnce()
  })
})

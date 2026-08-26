import { describe, expect, it, vi } from 'vitest'
import type { SessionId, SessionListState, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import { ChatStarter } from '../src/client/start-chat.ts'

const sid = (id: string) => id as SessionId

function state(rows: Record<string, SessionSummary>): SessionListState {
  return {
    ids: Object.keys(rows).map(sid), byId: rows, current: undefined, phase: 'ready',
    subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }
}

describe('ChatStarter', () => {
  it('reuses a blank chat and coalesces concurrent creation when none exists', async () => {
    let list = state({
      [sid('blank')]: {
        id: sid('blank'), displayTitle: 'blank', blank: true, running: false,
        updatedAt: 1, agentPreset: 'chat',
      },
    })
    const open = vi.fn()
    const openWhenReady = vi.fn()
    let resolveCreate!: (id: SessionId) => void
    const create = vi.fn(() => new Promise<SessionId>((resolve) => { resolveCreate = resolve }))
    const starter = new ChatStarter({ list: { getSnapshot: () => list }, create, open, openWhenReady })

    starter.start()
    expect(open).toHaveBeenCalledWith(sid('blank'))
    expect(create).not.toHaveBeenCalled()

    list = state({})
    starter.start()
    starter.start()
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith({ agentPreset: 'chat' })
    expect(openWhenReady).toHaveBeenCalledTimes(2)
    expect(openWhenReady.mock.calls[0]?.[0]).toBe(openWhenReady.mock.calls[1]?.[0])
    resolveCreate(sid('fresh'))
    await Promise.resolve()
    expect(open).toHaveBeenCalledOnce()
  })
})

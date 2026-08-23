import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { AgentPresetSessionSwitchController } from '../src/client/session-switch-store.ts'
import type { SwitchableSessionSummary } from '../src/client/session-switch-store.ts'

const ID = 'session-switch' as SessionId

function response(agentPreset: string) {
  return { rpcId: 'r', result: { ok: true as const, value: { agentPreset } } }
}

function failure(code: string, message: string) {
  return { rpcId: 'r', result: { ok: false as const, error: { code, message, details: {} } } }
}

describe('session-header preset switching', () => {
  it('queues during a running turn and commits after the list reports idle', async () => {
    let summary: SwitchableSessionSummary = { id: ID, running: true, agentPreset: 'standard' }
    const select = vi.fn((payload: { agentPreset: string }) => Promise.resolve(response(payload.agentPreset)))
    const applied: string[] = []
    const controller = new AgentPresetSessionSwitchController(
      { agentPresets: { select } } as never,
      () => summary,
      (_sessionId, preset) => { applied.push(preset); summary = { ...summary, agentPreset: preset } },
    )

    await controller.select(ID, 'code')
    expect(select).not.toHaveBeenCalled()
    expect(controller.store.getSnapshot().bySession[ID]).toEqual({ pending: 'code', busy: false, error: null })

    summary = { ...summary, running: false }
    controller.flushAll()
    await vi.waitFor(() => { expect(applied).toEqual(['code']) })
    expect(select).toHaveBeenCalledWith({ sessionId: ID, agentPreset: 'code' })
    expect(controller.store.getSnapshot().bySession).toEqual({})
  })

  it('retains a pick rejected by a stale running snapshot and retries it', async () => {
    const select = vi.fn()
      .mockResolvedValueOnce(failure('agent-preset-locked', 'turn running'))
      .mockResolvedValueOnce(response('cordis'))
    const applied = vi.fn()
    const controller = new AgentPresetSessionSwitchController(
      { agentPresets: { select } } as never,
      () => ({ id: ID, running: false, agentPreset: 'standard' }),
      applied,
    )

    await controller.select(ID, 'cordis')
    expect(controller.store.getSnapshot().bySession[ID]).toEqual({ pending: 'cordis', busy: false, error: null })

    controller.flushAll()
    await vi.waitFor(() => { expect(applied).toHaveBeenCalledWith(ID, 'cordis') })
    expect(controller.store.getSnapshot().bySession).toEqual({})
  })

  it('reports permanent Host and transport failures', async () => {
    const host = new AgentPresetSessionSwitchController(
      { agentPresets: { select: () => Promise.resolve(failure('internal', 'preset unavailable')) } } as never,
      () => ({ id: ID, running: false, agentPreset: 'standard' }),
      vi.fn(),
    )
    await host.select(ID, 'minimal')
    expect(host.store.getSnapshot().bySession[ID]).toEqual({ busy: false, error: 'preset unavailable' })

    const transport = new AgentPresetSessionSwitchController(
      { agentPresets: { select: () => Promise.reject(new Error('socket closed')) } } as never,
      () => ({ id: ID, running: false, agentPreset: 'standard' }),
      vi.fn(),
    )
    await transport.select(ID, 'minimal')
    expect(transport.store.getSnapshot().bySession[ID]).toEqual({ busy: false, error: 'socket closed' })
  })

  it('cancels a queued pick by reselecting the current preset', async () => {
    const controller = new AgentPresetSessionSwitchController(
      { agentPresets: { select: vi.fn() } } as never,
      () => ({ id: ID, running: true, agentPreset: 'standard' }),
      vi.fn(),
    )

    await controller.select(ID, 'minimal')
    await controller.select(ID, 'standard')

    expect(controller.store.getSnapshot().bySession).toEqual({})
  })

  it('clears vanished or externally completed sessions and matching owner events', async () => {
    let summary: SwitchableSessionSummary | undefined = { id: ID, running: true, agentPreset: 'standard' }
    const controller = new AgentPresetSessionSwitchController(
      { agentPresets: { select: vi.fn() } } as never,
      () => summary,
      vi.fn(),
    )

    await controller.select(ID, 'code')
    controller.confirm(ID, 'minimal')
    expect(controller.store.getSnapshot().bySession[ID]?.pending).toBe('code')
    controller.confirm(ID, 'code')
    expect(controller.store.getSnapshot().bySession).toEqual({})

    await controller.select(ID, 'code')
    summary = { ...summary, agentPreset: 'code' } as SwitchableSessionSummary
    controller.flushAll()
    expect(controller.store.getSnapshot().bySession).toEqual({})

    summary = undefined
    await controller.select(ID, 'minimal')
    expect(controller.store.getSnapshot().bySession).toEqual({})
  })

  it('ignores another pick while a Host switch is in flight', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void
    const pending = new Promise<ReturnType<typeof response>>((done) => { resolve = done })
    const select = vi.fn(() => pending)
    const controller = new AgentPresetSessionSwitchController(
      { agentPresets: { select } } as never,
      () => ({ id: ID, running: false, agentPreset: 'standard' }),
      vi.fn(),
    )

    const first = controller.select(ID, 'minimal')
    await vi.waitFor(() => { expect(controller.store.getSnapshot().bySession[ID]?.busy).toBe(true) })
    await controller.select(ID, 'code')
    expect(select).toHaveBeenCalledTimes(1)
    resolve(response('minimal'))
    await first
  })
})

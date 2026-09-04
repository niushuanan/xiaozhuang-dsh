/**
 * Host-side tests for the agent-terminal bridge: snapshot projection, the
 * change-diff notify (push), and the ownership fence of `agent-terminal.read`
 * / `agent-terminal.close`. The official `ctx.terminals` service is faked
 * structurally (a Map of snapshots per agent) — the bridge only ever reads it
 * through the mirror faces, so identity/ownership is asserted against the
 * exact Agent object the caller resolved.
 */
import { describe, expect, it } from 'vitest'
import { AgentTerminalBridge } from '../src/agent-terminal-bridge.ts'
import { SidebarError } from '../src/wire.ts'
import type {
  Context,
  SidebarAgent,
  SidebarAgentsService,
  SidebarTerminalReadResult,
  SidebarTerminalSnapshot,
  SidebarTerminalsService,
} from '../src/context-types.ts'

function agent(id: string): SidebarAgent {
  return { id, session: { header: { cwd: '/tmp' } } } as SidebarAgent
}

function snapshot(terminalId: string, over: Partial<SidebarTerminalSnapshot> = {}): SidebarTerminalSnapshot {
  return { sessionId: terminalId, type: 'shell', status: { kind: 'running' }, ...over }
}

interface Harness {
  ctx: Context
  agents: Map<string, SidebarAgent>
  terminals: Map<string, SidebarTerminalSnapshot[]>
  readResults: Map<string, SidebarTerminalReadResult>
  closedIds: string[]
}

function harness(): Harness {
  const agents = new Map<string, SidebarAgent>()
  const terminals = new Map<string, SidebarTerminalSnapshot[]>()
  const readResults = new Map<string, SidebarTerminalReadResult>()
  const closedIds: string[] = []

  const agentsService: SidebarAgentsService = {
    get: id => agents.get(id),
    list: () => [...agents.values()],
  }
  const terminalsService: SidebarTerminalsService = {
    list: owner => terminals.get(String(owner.id)) ?? [],
    read: (_owner, id) => readResults.get(id) ?? { text: '', totalLines: 0, lineBegin: 0, lineEnd: 0, truncated: false },
    close: async (owner, id) => {
      const list = terminals.get(String(owner.id)) ?? []
      const index = list.findIndex(candidate => candidate.sessionId === id)
      if (index < 0) return false
      closedIds.push(id)
      list.splice(index, 1)
      return true
    },
  }
  const ctx = {
    get: (name: string) => (name === 'agents' ? agentsService : name === 'terminals' ? terminalsService : undefined),
    on: () => () => {},
  } as unknown as Context
  return { ctx, agents, terminals, readResults, closedIds }
}

describe('agent-terminal bridge', () => {
  it('projects the official snapshots into the mirror wire shape', () => {
    const h = harness()
    const owner = agent('sess-a')
    h.agents.set('sess-a', owner)
    h.terminals.set('sess-a', [
      snapshot('pty-1', { name: 'main', pid: 42, status: { kind: 'exited', exitCode: 0, signal: null } }),
    ])
    const bridge = new AgentTerminalBridge(h.ctx)
    expect(bridge.list('sess-a')).toEqual([{
      terminalId: 'pty-1',
      name: 'main',
      type: 'shell',
      pid: 42,
      exited: true,
      exitCode: 0,
      exitSignal: null,
    }])
  })

  it('notifies subscribers only when a session list changed (the diff)', () => {
    const h = harness()
    const owner = agent('sess-a')
    h.agents.set('sess-a', owner)
    h.terminals.set('sess-a', [snapshot('pty-1')])
    const bridge = new AgentTerminalBridge(h.ctx)

    let fires = 0
    bridge.subscribe(() => { fires += 1 })

    // First refresh detects the initial list (empty → one terminal) and fires.
    bridge.refresh()
    expect(fires).toBe(1)
    // An unchanged list is a no-op.
    bridge.refresh()
    expect(fires).toBe(1)
    // A terminal appearing fires again.
    h.terminals.set('sess-a', [snapshot('pty-1'), snapshot('pty-2')])
    bridge.refresh()
    expect(fires).toBe(2)
    // The pushed list reflects the live service.
    expect(bridge.list('sess-a').map(s => s.terminalId)).toEqual(['pty-1', 'pty-2'])
  })

  it('reads an owned terminal and reports its status', () => {
    const h = harness()
    const owner = agent('sess-a')
    h.agents.set('sess-a', owner)
    h.terminals.set('sess-a', [snapshot('pty-1', { status: { kind: 'exited', exitCode: 3, signal: null } })])
    h.readResults.set('pty-1', { text: 'hello\n', totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: false })
    const bridge = new AgentTerminalBridge(h.ctx)
    expect(bridge.read('sess-a', 'pty-1', 0, 10)).toEqual({
      text: 'hello\n', totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: false, exited: true, exitCode: 3, exitSignal: null,
    })
  })

  it('rejects a foreign session terminal on read (not-found)', () => {
    const h = harness()
    h.agents.set('sess-a', agent('sess-a'))
    h.agents.set('sess-b', agent('sess-b'))
    h.terminals.set('sess-a', [snapshot('pty-1')])
    h.terminals.set('sess-b', [snapshot('pty-2')])
    const bridge = new AgentTerminalBridge(h.ctx)
    // sess-b's terminal is indistinguishable from unknown for sess-a.
    expect(() => bridge.read('sess-a', 'pty-2')).toThrowError(SidebarError)
    expect(() => bridge.read('sess-a', 'nope')).toThrowError(SidebarError)
    // A live agent that owns nothing also refuses.
    h.terminals.set('sess-b', [])
    expect(() => bridge.read('sess-a', 'pty-2')).toThrowError(SidebarError)
  })

  it('closes an owned terminal and rejects a foreign one', async () => {
    const h = harness()
    h.agents.set('sess-a', agent('sess-a'))
    h.agents.set('sess-b', agent('sess-b'))
    h.terminals.set('sess-a', [snapshot('pty-1')])
    h.terminals.set('sess-b', [snapshot('pty-2')])
    const bridge = new AgentTerminalBridge(h.ctx)

    await expect(bridge.close('sess-a', 'pty-2')).rejects.toThrowError(SidebarError)
    await expect(bridge.close('sess-a', 'pty-1')).resolves.toEqual({ closed: true })
    expect(h.closedIds).toEqual(['pty-1'])
    expect(bridge.list('sess-a')).toEqual([])
  })

  it('degrades to an empty list and not-found when the services are absent', () => {
    const ctx = { get: () => undefined, on: () => () => {} } as unknown as Context
    const bridge = new AgentTerminalBridge(ctx)
    expect(bridge.list('sess-a')).toEqual([])
    expect(() => bridge.read('sess-a', 'pty-1')).toThrowError(SidebarError)
  })
})

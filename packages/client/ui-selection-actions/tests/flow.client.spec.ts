// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { addSelectionQuote, consumeSelectionQuoteHandoff, openSelectionQuote } from '../src/client/flow.ts'

afterEach(() => { localStorage.clear() })

describe('selection quote flow', () => {
  it('adds a reference to the current composer without replacing its draft', () => {
    let state = {
      draft: '先问一个问题', draftRev: 3, occurrences: [] as Array<Record<string, unknown>>,
    }
    const subscribers = new Set<() => void>()
    const input = {
      setDraft: vi.fn((draft: string) => { state = { ...state, draft, draftRev: state.draftRev + 1 } }),
      insertReference: vi.fn((reference, span) => {
        const displayText = '\u2060'
        state = {
          draft: `${state.draft.slice(0, span.start)}${displayText} ${state.draft.slice(span.end)}`,
          draftRev: state.draftRev + 1,
          occurrences: [{
            occurrenceId: 1, source: reference.source, ref: reference.ref,
            offset: span.start, length: displayText.length,
          }],
        }
        for (const subscriber of subscribers) subscriber()
        return true
      }),
      state: {
        getSnapshot: () => state,
        subscribe: (subscriber: () => void) => { subscribers.add(subscriber); return () => subscribers.delete(subscriber) },
      },
    }
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ current: 's1', byId: {}, archivedSessionIds: [] }) },
        binding: vi.fn(() => ({ ctx: { scope: 's1' } })),
      },
      conversation: { input: { for: vi.fn(() => input) } },
    }

    const active = addSelectionQuote(ctx as never, {
      selectedText: '核心功能', context: '上下文', sessionId: 's1', cwd: '/work/dsh', sourceType: 'dsh',
      messageRole: 'assistant', messageSeq: 8, rect: { left: 0, top: 0, bottom: 0, width: 0 },
    })

    expect(input.setDraft).not.toHaveBeenCalled()
    expect(input.insertReference).toHaveBeenCalledWith(expect.objectContaining({ source: 'selection-reference' }), {
      start: 6, end: 6, draftRev: 3,
    })
    expect(state.draft).toBe('先问一个问题\u2060 ')
    expect(active.getSnapshot()).toBe(true)
  })

  it('opens a pane and transfers the unsent reference only into its destination input', async () => {
    let state = { draft: '', draftRev: 0, occurrences: [] as Array<Record<string, unknown>> }
    const setDraft = vi.fn((draft: string) => { state = { ...state, draft, draftRev: state.draftRev + 1 } })
    const insertReference = vi.fn((reference) => {
      state = { ...state, occurrences: [{ occurrenceId: 1, source: reference.source }] }
      return true
    })
    const input = {
      setDraft,
      insertReference,
      state: { getSnapshot: () => state, subscribe: () => () => {} },
    }
    const openSession = vi.fn(() => 'opened' as const)
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ current: 's1', byId: {}, archivedSessionIds: [] }) },
        binding: vi.fn(() => ({ ctx: { scope: 's2' } })),
      },
      workspaces: {
        list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', path: '/work/dsh', sessionIds: ['s1'] }], archivedSessionIds: [] }) },
      },
      uiWorkspace: { connectWorkspace: vi.fn(async () => 's2') },
      conversation: { input: { for: vi.fn(() => input) } },
    }
    const result = await openSelectionQuote(ctx as never, {
      selectedText: '核心功能', context: '上下文', sessionId: 's1', cwd: '/work/dsh', sourceType: 'dsh',
      messageRole: 'assistant', messageSeq: 8, rect: { left: 0, top: 0, bottom: 0, width: 0 },
    }, { canOpenSession: () => true, openSession })
    expect(result).toEqual({ sessionId: 's2', pane: 'opened' })
    expect(ctx.uiWorkspace.connectWorkspace).toHaveBeenCalledWith('w1')
    expect(ctx.sessions.binding).not.toHaveBeenCalled()
    expect(setDraft).not.toHaveBeenCalled()
    expect(insertReference).not.toHaveBeenCalled()
    expect(openSession).toHaveBeenCalledWith('s2')
    expect(localStorage.getItem('dsh.selection-quote.s2')).toContain('核心功能')

    let destinationState = { draft: '', draftRev: 0, occurrences: [] as Array<Record<string, unknown>> }
    const destinationInput = {
      setDraft: vi.fn((draft: string) => {
        destinationState = { ...destinationState, draft, draftRev: destinationState.draftRev + 1 }
      }),
      insertReference: vi.fn((reference) => {
        destinationState = { ...destinationState, occurrences: [{ occurrenceId: 2, source: reference.source }] }
        return true
      }),
      state: { getSnapshot: () => destinationState, subscribe: () => () => {} },
    }
    expect(consumeSelectionQuoteHandoff({
      sessions: { binding: () => ({ ctx: { scope: 'destination' } }) },
      conversation: { input: { for: () => destinationInput } },
    } as never, 's2' as never, localStorage)).toBe(true)
    expect(destinationInput.setDraft).not.toHaveBeenCalled()
    expect(destinationInput.insertReference).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('dsh.selection-quote.s2')).toBeNull()
  })

  it('does not create or seed a side conversation when the pane workspace is full', async () => {
    const connectWorkspace = vi.fn(async () => 's2')
    const ctx = {
      sessions: { list: { getSnapshot: () => ({ byId: {}, archivedSessionIds: [] }) } },
      workspaces: {
        list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s1'] }], archivedSessionIds: [] }) },
      },
      uiWorkspace: { connectWorkspace },
    }

    const result = await openSelectionQuote(ctx as never, {
      selectedText: '核心功能', context: '上下文', sessionId: 's1', cwd: '/work/dsh', sourceType: 'dsh',
      messageRole: 'assistant', messageSeq: 8, rect: { left: 0, top: 0, bottom: 0, width: 0 },
    }, { canOpenSession: () => false, openSession: vi.fn(() => 'limit' as const) })

    expect(result).toEqual({ pane: 'limit' })
    expect(connectWorkspace).not.toHaveBeenCalled()
    expect(localStorage.getItem('dsh.selection-quote.s2')).toBeNull()
  })

  it('does not seed a quote if pane capacity changes while the conversation connects', async () => {
    const setDraft = vi.fn()
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ byId: {}, archivedSessionIds: [] }) },
        binding: vi.fn(() => ({ ctx: { scope: 's2' } })),
      },
      workspaces: {
        list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s1'] }], archivedSessionIds: [] }) },
      },
      uiWorkspace: { connectWorkspace: vi.fn(async () => 's2') },
      conversation: { input: { for: vi.fn(() => ({ setDraft })) } },
    }

    const result = await openSelectionQuote(ctx as never, {
      selectedText: '核心功能', context: '上下文', sessionId: 's1', cwd: '/work/dsh', sourceType: 'dsh',
      messageRole: 'assistant', messageSeq: 8, rect: { left: 0, top: 0, bottom: 0, width: 0 },
    }, { canOpenSession: () => true, openSession: vi.fn(() => 'limit' as const) })

    expect(result).toEqual({ pane: 'limit' })
    expect(setDraft).not.toHaveBeenCalled()
    expect(localStorage.getItem('dsh.selection-quote.s2')).toBeNull()
  })

  it('hydrates and removes an unsent quote inside the auxiliary pane runtime', () => {
    const packet = {
      selectedText: '核心功能', context: '上下文', sessionId: 's1', cwd: '/work/dsh', sourceType: 'dsh' as const,
      messageRole: 'assistant' as const, messageSeq: 8, rect: { left: 0, top: 0, bottom: 0, width: 0 },
    }
    localStorage.setItem('dsh.selection-quote.s2', JSON.stringify({ version: 1, packet }))
    let state = { draft: '', draftRev: 1, occurrences: [] as Array<Record<string, unknown>> }
    const input = {
      setDraft: vi.fn((draft: string) => { state = { ...state, draft, draftRev: state.draftRev + 1 } }),
      insertReference: vi.fn((reference) => {
        state = { ...state, occurrences: [{ occurrenceId: 1, source: reference.source }] }
        return true
      }),
      state: { getSnapshot: () => state, subscribe: () => () => {} },
    }
    const ctx = {
      sessions: { binding: vi.fn(() => ({ ctx: { scope: 's2' } })) },
      conversation: { input: { for: vi.fn(() => input) } },
    }

    expect(consumeSelectionQuoteHandoff(ctx as never, 's2' as never, localStorage)).toBe(true)
    expect(input.setDraft).not.toHaveBeenCalled()
    expect(input.insertReference).toHaveBeenCalledWith(expect.objectContaining({ source: 'selection-reference' }), {
      start: 0, end: 0, draftRev: 1,
    })
    expect(localStorage.getItem('dsh.selection-quote.s2')).toBeNull()
  })
})

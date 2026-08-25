/** Browser half of DSH's native quote and memory selection actions. */

import { currentDshWindowContext, type ClientContext, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MultiPaneService } from '@deepseek-ai/dsh-client-ui-multi-window/client'
import { MemoryUnavailableError, rememberSelection, undoSelectionMemory } from './api.ts'
import { addSelectionQuote, consumeSelectionQuoteHandoff, openSelectionQuote } from './flow.ts'
import { en, NS, zh } from './locales.ts'
import { serializeSelectionReference } from './reference.ts'
import { captureDshSelection } from './selection.ts'
import { SelectionActions } from './SelectionActions.tsx'
import { SelectionReferenceDock } from './SelectionReferenceDock.tsx'

export { SelectionActions } from './SelectionActions.tsx'
export { captureDshSelection, type DshSelectionPacket } from './selection.ts'
export { createSelectionReference, serializeSelectionReference } from './reference.ts'
export { addSelectionQuote, openSelectionQuote } from './flow.ts'

export const inject = ['slots', 'sessions', 'workspaces', 'conversation', 'inputTriggers', 'locale']

/** Mount the hidden reference codec and one global two-action selection popover. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'selection-actions: dictionaries')
  const referenceSource: InputTriggerSource = {
    trigger: '@',
    name: 'selection-reference',
    showGroupTitle: false,
    candidates: () => Promise.resolve([]),
    onPick: () => undefined,
    codec: {
      clipboardText: ref => `“${JSON.parse(decodeURIComponent(ref)).selectedText as string}”`,
      serialize: ref => Promise.resolve(serializeSelectionReference(ref)),
    },
  }
  ctx.effect(() => ctx.inputTriggers.registerSource(referenceSource), 'selection-actions: quote reference codec')

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'selection-references',
    order: -20,
    locale: NS,
    inject: (sessionId: SessionId) => ({
      removeReference: (occurrenceId: number): void => {
        const binding = ctx.sessions.binding(sessionId)
        if (binding === undefined) return
        const input = ctx.conversation.input.for(binding.ctx)
        const state = input.state.getSnapshot()
        const occurrence = state.occurrences.find(candidate => candidate.occurrenceId === occurrenceId)
        if (occurrence === undefined || occurrence.source !== 'selection-reference') return
        let start = occurrence.offset
        let end = occurrence.offset + occurrence.length
        if (state.draft[end] === ' ') end += 1
        if (start > 0 && state.draft[start - 1] === '\n' && end === state.draft.length) start -= 1
        input.setDraft(
          state.draft.slice(0, start) + state.draft.slice(end),
          { start, end, insertedLength: 0 },
        )
      },
    }),
  }, SelectionReferenceDock))

  if (currentDshWindowContext().role === 'auxiliary') {
    const hydrate = (): void => {
      const sessionId = ctx.sessions.list.getSnapshot().current
      if (sessionId !== undefined) consumeSelectionQuoteHandoff(ctx, sessionId as SessionId)
    }
    hydrate()
    ctx.effect(() => ctx.sessions.list.subscribe(hydrate), 'selection-actions: hydrate pane quote')
    ctx.effect(() => {
      window.addEventListener('storage', hydrate)
      return () => { window.removeEventListener('storage', hydrate) }
    }, 'selection-actions: receive pane quote')
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'selection-actions',
    order: 25,
    locale: NS,
    inject: () => ({
      capture: () => {
        const state = ctx.sessions.list.getSnapshot()
        const sessionId = state.current
        if (sessionId === undefined) return undefined
        return captureDshSelection(document, sessionId, state.byId[sessionId]?.cwd)
      },
      quote: async packet => addSelectionQuote(ctx, packet),
      sideChat: async (packet) => {
        const multiPane = ctx.get('multiPane') as MultiPaneService | undefined
        if (multiPane === undefined) throw new Error(ctx.locale.bind(NS)('quote.unavailable'))
        return (await openSelectionQuote(ctx, packet, multiPane)).pane
      },
      remember: async (packet) => {
        try {
          return await rememberSelection(packet)
        } catch (error) {
          if (error instanceof MemoryUnavailableError) throw new Error(ctx.locale.bind(NS)('memory.unavailable'))
          throw error
        }
      },
      undo: async revision => undoSelectionMemory(revision),
    }),
  }, SelectionActions))
}

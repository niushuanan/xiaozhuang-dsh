// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TypewriterAssistantNodeView } from '../src/client/TypewriterAssistantNodeView.tsx'

const queue = vi.hoisted(() => vi.fn())
vi.mock('../src/client/useSmoothStreamContent.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/client/useSmoothStreamContent.ts')>()
  return { ...actual, useSmoothStreamContent: (...args: Parameters<typeof actual.useSmoothStreamContent>) => {
    queue(...args)
    return actual.useSmoothStreamContent(...args)
  } }
})
afterEach(() => { cleanup(); queue.mockClear() })
const props = (status: 'settled' | 'running', groupPart?: 'reasoning' | 'response') => ({
  node: { kind: 'assistant-step', location: { kind: 'unresolved' }, data: {
    status, turn: 1, step: 1, time: 0,
    blocks: [{ kind: 'reasoning', text: 'Earlier reasoning' }, { kind: 'text', text: 'Completed answer' }],
  } },
  groupPart, thinkAutoExpand: false, useTurnData: () => undefined,
  openFile: () => {}, fileMentions: () => undefined, t: (key: string) => key,
}) as unknown as Parameters<typeof TypewriterAssistantNodeView>[0]

it('renders terminal history without a character queue and honors native split parts', () => {
  const reasoning = render(<TypewriterAssistantNodeView {...props('settled', 'reasoning')} />)
  expect(reasoning.container.textContent).toContain('Earlier reasoning')
  expect(reasoning.container.textContent).not.toContain('Completed answer')
  reasoning.unmount()
  const response = render(<TypewriterAssistantNodeView {...props('settled', 'response')} />)
  expect(response.container.textContent).toContain('Completed answer')
  expect(response.container.textContent).not.toContain('Earlier reasoning')
  expect(queue).not.toHaveBeenCalled()
})

it('retains actual smoothing for an observed live assistant row', () => {
  render(<TypewriterAssistantNodeView {...props('running', 'response')} />)
  expect(queue).toHaveBeenCalledWith('Completed answer', expect.objectContaining({ enabled: true }))
})

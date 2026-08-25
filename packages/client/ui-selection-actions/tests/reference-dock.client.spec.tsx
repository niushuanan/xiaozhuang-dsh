// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelectionReferenceDock } from '../src/client/SelectionReferenceDock.tsx'
import { createSelectionReference } from '../src/client/reference.ts'

afterEach(cleanup)

describe('SelectionReferenceDock', () => {
  it('shows the selected source on hover and removes the exact annotation', () => {
    const reference = createSelectionReference({
      selectedText: '核心功能要先跑通', context: '上下文', sessionId: 's1', sourceType: 'dsh',
      messageRole: 'assistant', messageSeq: 8, rect: { left: 0, top: 0, bottom: 0, width: 0 },
    })
    const removeReference = vi.fn()
    const Component = SelectionReferenceDock as ComponentType<Record<string, unknown>>
    render(<Component
      input={{ occurrences: [{
        occurrenceId: 7, source: reference.source, ref: reference.ref, offset: 0,
        length: 5, label: reference.label, appearance: reference.appearance,
        clipboardText: reference.clipboardText,
      }] } as never}
      removeReference={removeReference}
      t={(key: string, params?: Record<string, unknown>) => key === 'quote.count'
        ? `${String(params?.count)} 个已选文本`
        : key}
    />)

    expect(screen.getByText('1 个已选文本')).toBeTruthy()
    expect(screen.getByText('核心功能要先跑通')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'quote.remove' }))
    expect(removeReference).toHaveBeenCalledWith(7)
  })

  it('shows one selected-text count when more than one quote is attached', () => {
    const first = createSelectionReference({
      selectedText: '第一段', context: '上下文', sessionId: 's1', sourceType: 'dsh',
      messageRole: 'assistant', messageSeq: 8, rect: { left: 0, top: 0, bottom: 0, width: 0 },
    })
    const second = createSelectionReference({
      selectedText: '第二段', context: '上下文', sessionId: 's1', sourceType: 'dsh',
      messageRole: 'assistant', messageSeq: 9, rect: { left: 0, top: 0, bottom: 0, width: 0 },
    })
    const Component = SelectionReferenceDock as ComponentType<Record<string, unknown>>
    render(<Component
      input={{ occurrences: [first, second].map((reference, index) => ({
        occurrenceId: index + 1, source: reference.source, ref: reference.ref, offset: index,
        length: 1, label: reference.label, presentation: reference.presentation,
        clipboardText: reference.clipboardText,
      })) } as never}
      removeReference={vi.fn()}
      t={(key: string, params?: Record<string, unknown>) => key === 'quote.count'
        ? `${String(params?.count)} 个已选文本`
        : key}
    />)

    expect(screen.getAllByText('2 个已选文本')).toHaveLength(1)
    expect(screen.getByText('第一段')).toBeTruthy()
    expect(screen.getByText('第二段')).toBeTruthy()
  })
})

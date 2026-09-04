import { describe, expect, it } from 'vitest'
import { createSelectionReference, serializeSelectionReference } from '../src/client/reference.ts'

const selection = {
  selectedText: '先做核心功能',
  context: '[assistant #8]\n先做核心功能，再同步 README。',
  sessionId: 's1',
  cwd: '/work/dsh',
  sourceType: 'dsh' as const,
  messageRole: 'assistant' as const,
  messageSeq: 8,
  rect: { left: 10, top: 20, bottom: 30, width: 100 },
}

describe('selection reference', () => {
  it('shows an annotation label but serializes bounded structured evidence for the model', () => {
    const reference = createSelectionReference(selection)
    expect(reference.label).toBe('已选文本')
    expect(reference).not.toHaveProperty('presentation')
    expect(reference.clipboardText).toBe('“先做核心功能”')
    const model = serializeSelectionReference(reference.ref)
    expect(model).toContain('<quoted_selection>')
    expect(model).toContain('"selectedText":"先做核心功能"')
    expect(model).toContain('untrusted quoted evidence')
    expect(model).not.toContain(reference.ref)
  })
})

import { describe, expect, it } from 'vitest'
import { captureElementTarget, resolveLiveElementIndex } from '../src/desktop.ts'

describe('desktop accessibility targets', () => {
  it('follows a stable element when its live index changes', () => {
    const planned = captureElementTarget([
      'Window: "Example"',
      '\t10 button Submit ID: SubmitButton',
      '\t11 button Cancel ID: CancelButton',
    ].join('\n'), '10')

    expect(resolveLiveElementIndex([
      'Window: "Example"',
      '\t2 text Status ID: StatusLabel',
      '\t7 button Submit ID: SubmitButton',
    ].join('\n'), planned)).toBe('7')
  })

  it('fails closed when a changed interface no longer identifies the target', () => {
    const planned = captureElementTarget('\t4 button Continue', '4')

    expect(() => resolveLiveElementIndex([
      '\t4 button Back',
      '\t5 button Continue',
      '\t6 button Continue',
    ].join('\n'), planned)).toThrow('目标元素已不可唯一定位')
  })
})

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { captureDshSelection } from '../src/client/selection.ts'

afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges() })

describe('DSH selection capture', () => {
  it('captures only text inside an addressed DSH message with bounded neighbor context', () => {
    document.body.innerHTML = `
      <div data-dsh-session-id="s1">
        <div data-dsh-message data-dsh-message-role="user" data-dsh-message-seq="4">为什么这样？</div>
        <div data-dsh-message data-dsh-message-role="assistant" data-dsh-message-seq="8">先做核心功能，再同步 README。</div>
        <div data-dsh-message data-dsh-message-role="user" data-dsh-message-seq="9">好的</div>
      </div>`
    const target = document.querySelector('[data-dsh-message-seq="8"]')?.firstChild
    const range = document.createRange()
    range.setStart(target as Text, 2)
    range.setEnd(target as Text, 6)
    window.getSelection()?.addRange(range)

    expect(captureDshSelection(document, 's1', '/work/dsh')).toMatchObject({
      selectedText: '核心功能',
      sessionId: 's1',
      cwd: '/work/dsh',
      sourceType: 'dsh',
      messageRole: 'assistant',
      messageSeq: 8,
    })
    expect(captureDshSelection(document, 's1')?.context).toContain('为什么这样？')
    expect(captureDshSelection(document, 's1')?.context).toContain('好的')
  })

  it('ignores ordinary settings and browser chrome text', () => {
    document.body.innerHTML = '<p>不属于会话的文字</p>'
    const target = document.querySelector('p')?.firstChild
    const range = document.createRange()
    range.selectNodeContents(target as Text)
    window.getSelection()?.addRange(range)
    expect(captureDshSelection(document, 's1')).toBeUndefined()
  })
})

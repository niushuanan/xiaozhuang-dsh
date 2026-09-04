/** DOM-to-product selection packet conversion for native DSH conversations. */

export interface SelectionRect {
  readonly left: number
  readonly top: number
  readonly bottom: number
  readonly width: number
}
export interface DshSelectionPacket {
  readonly selectedText: string
  readonly context: string
  readonly sessionId: string
  readonly cwd?: string
  readonly sourceType: 'dsh'
  readonly messageRole: 'user' | 'assistant'
  readonly messageSeq: number
  readonly rect: SelectionRect
}

function elementOf(node: Node | null): Element | null {
  if (node === null) return null
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
}

function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 16_000)
}

function contextAround(session: Element, message: Element): string {
  const messages = [...session.querySelectorAll<HTMLElement>('[data-dsh-message]')]
  const index = messages.indexOf(message as HTMLElement)
  if (index < 0) return textOf(message)
  return messages.slice(Math.max(0, index - 1), index + 2).map((element) => {
    const role = element.dataset.dshMessageRole ?? 'message'
    const seq = element.dataset.dshMessageSeq ?? '?'
    return `[${role} #${seq}]\n${textOf(element)}`
  }).join('\n\n').slice(0, 48_000)
}

function rangeRect(range: Range): SelectionRect {
  const value = typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect()
    : { left: 0, top: 0, bottom: 0, width: 0 }
  return { left: value.left, top: value.top, bottom: value.bottom, width: value.width }
}

/** Capture a non-collapsed selection only when both endpoints belong to one DSH message. */
export function captureDshSelection(
  document: Document,
  sessionId: string,
  cwd?: string,
): DshSelectionPacket | undefined {
  const selection = document.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return undefined
  const selectedText = selection.toString().replace(/\s+/gu, ' ').trim().slice(0, 32_000)
  if (selectedText === '') return undefined
  const range = selection.getRangeAt(0)
  const startMessage = elementOf(range.startContainer)?.closest('[data-dsh-message]')
  const endMessage = elementOf(range.endContainer)?.closest('[data-dsh-message]')
  if (startMessage === null || startMessage === undefined || startMessage !== endMessage) return undefined
  const session = startMessage.closest('[data-dsh-session-id]')
  if (session === null || session.getAttribute('data-dsh-session-id') !== sessionId) return undefined
  const role = startMessage.getAttribute('data-dsh-message-role')
  const seq = Number(startMessage.getAttribute('data-dsh-message-seq'))
  if ((role !== 'user' && role !== 'assistant') || !Number.isSafeInteger(seq) || seq < 0) return undefined
  return {
    selectedText,
    context: contextAround(session, startMessage),
    sessionId,
    ...cwd === undefined ? {} : { cwd },
    sourceType: 'dsh',
    messageRole: role,
    messageSeq: seq,
    rect: rangeRect(range),
  }
}

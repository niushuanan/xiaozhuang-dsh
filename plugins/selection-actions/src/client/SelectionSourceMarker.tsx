import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ActiveSelectionReference } from './flow.ts'
import css from './SelectionActions.module.css'

interface MarkerPosition { readonly left: number; readonly top: number }

export function sourceMarkerPosition(
  rect: Pick<DOMRect, 'right' | 'top' | 'bottom'>,
  number: number,
  viewport: { readonly width: number; readonly height: number },
): MarkerPosition | undefined {
  if (rect.bottom <= 0 || rect.top >= viewport.height) return undefined
  return {
    left: Math.min(viewport.width - 36, rect.right + 8),
    top: Math.min(viewport.height - 36, Math.max(8, rect.top + 8 + (number - 1) * 30)),
  }
}

/** Numbered source annotation that lives only while its unsent reference exists. */
export function SelectionSourceMarker({ reference, number }: {
  readonly reference: ActiveSelectionReference
  readonly number: number
}) {
  const active = useSyncExternalStore(reference.subscribe, reference.getSnapshot, reference.getSnapshot)
  const [position, setPosition] = useState<MarkerPosition>()

  useEffect(() => {
    if (!active) return
    const { messageRole, messageSeq } = reference.packet
    const selector = `[data-dsh-message][data-dsh-message-role="${messageRole}"][data-dsh-message-seq="${messageSeq}"]`
    const update = (): void => {
      const source = document.querySelector<HTMLElement>(selector)
      if (source === null) { setPosition(undefined); return }
      const rect = source.getBoundingClientRect()
      setPosition(sourceMarkerPosition(rect, number, { width: window.innerWidth, height: window.innerHeight }))
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [active, number, reference])

  if (!active || position === undefined) return null
  return (
    <span className={css.sourceMarker} style={position} tabIndex={0} aria-label={`引用 ${number}`}>
      {number}
      <span className={css.sourcePreview} role="tooltip">
        <span>{number}.</span>
        <span>{reference.packet.selectedText}</span>
      </span>
    </span>
  )
}

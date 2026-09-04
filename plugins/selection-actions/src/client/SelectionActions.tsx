import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActiveSelectionReference } from './flow.ts'
import { IconMemoryOutline16, IconQuoteOutline16, IconWindowNewOutline16 } from './icons.tsx'
import type {} from './locales.ts'
import type { DshSelectionPacket } from './selection.ts'
import { SelectionSourceMarker } from './SelectionSourceMarker.tsx'
import css from './SelectionActions.module.css'

export interface SelectionActionsInjected {
  capture: () => DshSelectionPacket | undefined
  quote: (packet: DshSelectionPacket) => Promise<ActiveSelectionReference>
  sideChat?: (packet: DshSelectionPacket) => Promise<'opened' | 'visible' | 'limit'>
  remember: (packet: DshSelectionPacket) => Promise<{ summary: string; changed: boolean; revision: string }>
  undo: (revision: string) => Promise<void>
}

export type SelectionActionsProps = PropsLocale<'selectionActions'> & InjectFace<SelectionActionsInjected>

interface Remembered {
  readonly summary: string
  readonly revision: string
}

/** Selection-anchored action bar shared by primary and embedded DSH panes. */
export function SelectionActions({ capture, quote, sideChat, remember, undo, t }: SelectionActionsProps) {
  const root = useRef<HTMLDivElement | null>(null)
  const [packet, setPacket] = useState<DshSelectionPacket>()
  const [busy, setBusy] = useState<'quote' | 'sideChat' | 'memory' | 'undo'>()
  const [references, setReferences] = useState<readonly ActiveSelectionReference[]>([])
  const [remembered, setRemembered] = useState<Remembered>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (references.length === 0) return
    const prune = (): void => {
      setReferences((current) => {
        const active = current.filter(reference => reference.getSnapshot())
        return active.length === current.length ? current : active
      })
    }
    const disposers = references.map(reference => reference.subscribe(prune))
    prune()
    return () => { for (const dispose of disposers) dispose() }
  }, [references])

  useEffect(() => {
    const update = (): void => {
      requestAnimationFrame(() => {
        const next = capture()
        if (next !== undefined) {
          setPacket(next)
          setRemembered(undefined)
          setMessage('')
          setError('')
        }
      })
    }
    const dismiss = (event: PointerEvent): void => {
      if (root.current?.contains(event.target as Node) === true) return
      // One press outside closes the bar. The old "only once the selection is
      // collapsed" guard could not fire on the first press: the browser
      // collapses the selection on release, so closing always took two clicks.
      setPacket(undefined)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPacket(undefined)
      else if (event.key === 'Shift' || event.key.startsWith('Arrow')) update()
    }
    document.addEventListener('pointerup', update)
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keyup', key)
    window.addEventListener('scroll', update, true)
    return () => {
      document.removeEventListener('pointerup', update)
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keyup', key)
      window.removeEventListener('scroll', update, true)
    }
  }, [capture])

  const left = packet === undefined ? 0 : Math.max(
    12,
    Math.min(window.innerWidth - 330, packet.rect.left + packet.rect.width / 2 - 150),
  )
  const top = packet === undefined ? 0 : (() => {
    const above = packet.rect.top - 40 - 4
    if (above >= 8) return above
    return Math.min(window.innerHeight - 48, packet.rect.bottom + 4)
  })()
  const runQuote = async (): Promise<void> => {
    if (busy !== undefined || packet === undefined) return
    const selected = packet
    setBusy('quote'); setError('')
    try {
      const result = await quote(selected)
      setReferences(current => [...current.filter(reference => reference.getSnapshot()), result])
      document.getSelection()?.removeAllRanges()
      setPacket(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(undefined) }
  }
  const runSideChat = async (): Promise<void> => {
    if (busy !== undefined || packet === undefined || sideChat === undefined) return
    const selected = packet
    setBusy('sideChat'); setError('')
    try {
      const result = await sideChat(selected)
      if (result === 'limit') { setError(t('quote.limit')); return }
      document.getSelection()?.removeAllRanges()
      setPacket(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(undefined) }
  }
  const runMemory = async (): Promise<void> => {
    if (busy !== undefined || packet === undefined) return
    const selected = packet
    setBusy('memory'); setError(''); setMessage('')
    try {
      const result = await remember(selected)
      setRemembered(result.changed ? result : undefined)
      setMessage(result.summary || t('memory.done'))
      document.getSelection()?.removeAllRanges()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(undefined) }
  }
  const runUndo = async (): Promise<void> => {
    if (remembered === undefined || busy !== undefined) return
    setBusy('undo'); setError('')
    try {
      await undo(remembered.revision)
      setRemembered(undefined)
      setMessage(t('undone'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(undefined) }
  }

  return (
    <>
      {references.map((reference, index) => (
        <SelectionSourceMarker key={reference.occurrenceId} reference={reference} number={index + 1} />
      ))}
      {packet === undefined ? null : <div
        ref={root}
        className={css.root}
        style={{ left, top }}
        role="toolbar"
        aria-label="selection actions"
        onPointerDown={(event) => { event.preventDefault() }}
      >
        {remembered === undefined && message === '' ? (
          <div className={css.actions}>
            <button type="button" disabled={busy !== undefined} onClick={() => { void runQuote() }}>
              <IconQuoteOutline16 size={14} />
              {busy === 'quote' ? t('quoting') : t('quote')}
            </button>
            <button type="button" disabled={busy !== undefined} onClick={() => { void runMemory() }}>
              <IconMemoryOutline16 size={14} />
              {busy === 'memory' ? t('remembering') : t('memory')}
            </button>
            {sideChat === undefined ? null : (
              <button type="button" disabled={busy !== undefined} onClick={() => { void runSideChat() }}>
                <IconWindowNewOutline16 size={14} />
                {busy === 'sideChat' ? t('openingSideChat') : t('sideChat')}
              </button>
            )}
          </div>
        ) : null}
        {message !== '' ? (
          <div className={css.result} role="status">
            <span>{message}</span>
            {remembered === undefined ? null : (
              <button type="button" disabled={busy !== undefined} onClick={() => { void runUndo() }}>{t('undo')}</button>
            )}
          </div>
        ) : null}
        {error === '' ? null : <div className={css.error} role="alert">{error}</div>}
      </div>}
    </>
  )
}

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from './locales.ts'
import { readSelectionReference } from './reference.ts'
import css from './SelectionReferenceDock.module.css'

export interface SelectionReferenceDockInjected {
  removeReference: (occurrenceId: number) => void
}

export type SelectionReferenceDockProps = PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'selectionActions'>
  & SelectionReferenceDockInjected

/** Compact selected-text annotations above the composer, with source preview on hover/focus. */
export function SelectionReferenceDock({ input, removeReference, t }: SelectionReferenceDockProps) {
  const references = input.occurrences.flatMap((occurrence) => {
    if (occurrence.source !== 'selection-reference') return []
    try {
      return [{ occurrence, payload: readSelectionReference(occurrence.ref) }]
    } catch {
      return []
    }
  })
  if (references.length === 0) return null
  return (
    <div className={css.dock}>
      <div className={css.row}>
        {references.map(({ occurrence, payload }, index) => (
          <div className={css.annotation} key={occurrence.occurrenceId}>
            <span className={css.marker} aria-hidden>{index + 1}</span>
            {index === 0 ? <span className={css.label}>{t('quote.count', { count: references.length })}</span> : null}
            <button
              type="button"
              className={css.remove}
              aria-label={t('quote.remove')}
              onClick={() => { removeReference(occurrence.occurrenceId) }}
            >
              <IconCloseOutline16 size={13} />
            </button>
            <span className={css.preview} role="tooltip">
              <span className={css.previewNumber}>{index + 1}.</span>
              <span>{payload.selectedText}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

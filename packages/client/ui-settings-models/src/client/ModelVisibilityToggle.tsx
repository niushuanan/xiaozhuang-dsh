/**
 * The per-model visibility switch shared by both catalog editors.
 *
 * Toggling writes the adapters' optional `hidden` flag; the shown state clears
 * it rather than storing `false`, matching how every other optional field on
 * these rows leaves the profile when unset. Hiding is advertisement-level:
 * the selector and every directory surface omit the model while its
 * configuration keeps serving, so nothing is deleted to stop seeing it.
 */

import type { ReactNode } from 'react'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** The open-eye glyph shown while the model is visible in the selector. */
function IconEye(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.7 8S4 3.8 8 3.8 14.3 8 14.3 8 12 12.2 8 12.2 1.7 8 1.7 8Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/** The closed-eye glyph shown while the model is hidden from the selector. */
function IconEyeOff(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.2 2.2l11.6 11.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M6.3 3.9A7.9 7.9 0 018 3.8c4 0 6.3 4.2 6.3 4.2a11 11 0 01-1.8 2.2M9.2 12a7.5 7.5 0 01-1.2.2C4 12.2 1.7 8 1.7 8a11.6 11.6 0 012-2.4"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

/** Props of {@link ModelVisibilityToggle}. */
export interface ModelVisibilityToggleProps {
  /** Whether the row is currently configured hidden. */
  hidden: boolean
  /** Row position, for a per-row accessible label. */
  index: number
  /** Disable the control (read-only deployment or a pending write). */
  disabled: boolean
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Store `true`, or clear the flag (not `false`) when revealing again. */
  onChange: (hidden: boolean | undefined) => void
}

/**
 * Render one model row's visibility switch: an eye that reads as pressed while
 * the row is hidden from the selector.
 * @param props - the row's state plus the mutation callback.
 * @returns the visibility toggle button.
 */
export function ModelVisibilityToggle(props: ModelVisibilityToggleProps): ReactNode {
  const { hidden, index, disabled, t } = props
  return (
    <button
      type="button"
      className={`${styles['iconButton']}${hidden ? ` ${styles['iconButtonHidden']}` : ''}`}
      aria-label={`${t('modelVisibility')} ${String(index + 1)}`}
      aria-pressed={hidden}
      title={hidden ? t('modelHidden') : t('modelVisible')}
      disabled={disabled}
      onClick={() => { props.onChange(hidden ? undefined : true) }}
    >
      {hidden ? <IconEyeOff /> : <IconEye />}
    </button>
  )
}

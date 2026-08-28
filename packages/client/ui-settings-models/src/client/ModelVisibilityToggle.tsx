/** Per-model visibility switch shared by both model catalog editors. */

import type { ReactNode } from 'react'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

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

export interface ModelVisibilityToggleProps {
  hidden: boolean
  index: number
  disabled: boolean
  t: (key: keyof typeof en) => string
  onChange: (hidden: boolean | undefined) => void
}

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

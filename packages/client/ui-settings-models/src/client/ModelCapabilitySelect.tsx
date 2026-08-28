/** Visible model-input classification shared by the direct DeepSeek and pi-ai editors. */

import type { ReactNode } from 'react'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

export type ModelCapability = 'text' | 'vision'

export function modelCapability(
  model: Readonly<Record<string, unknown>>,
  field: 'input' | 'inputModalities',
): ModelCapability {
  const modalities = model[field]
  return Array.isArray(modalities) && modalities.includes('image') ? 'vision' : 'text'
}

export function modelModalities(capability: ModelCapability): string[] {
  return capability === 'vision' ? ['text', 'image'] : ['text']
}

export interface ModelCapabilitySelectProps {
  model: Readonly<Record<string, unknown>>
  field: 'input' | 'inputModalities'
  index: number
  disabled: boolean
  t: (key: keyof typeof en) => string
  onChange: (value: string[]) => void
}

export function ModelCapabilitySelect(props: ModelCapabilitySelectProps): ReactNode {
  const capability = modelCapability(props.model, props.field)
  return (
    <select
      className={`${styles['modelCapabilitySelect']} ${styles['selectInput']}`}
      value={capability}
      aria-label={`${props.t('modelCapability')} ${String(props.index + 1)}`}
      title={props.t('modelCapability')}
      disabled={props.disabled}
      onChange={(event) => {
        props.onChange(modelModalities(event.target.value === 'vision' ? 'vision' : 'text'))
      }}
    >
      <option value="text">{props.t('modelTextOnly')}</option>
      <option value="vision">{props.t('modelVision')}</option>
    </select>
  )
}

/** Visible model-input classification shared by the direct DeepSeek and pi-ai editors. */

import type { ReactNode } from 'react'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** Product-level image routing choice; every supported model accepts text. */
export type ModelCapability = 'text' | 'vision'

/** Read a model's adapter-specific modality field as the two choices the UI exposes. */
export function modelCapability(model: Readonly<Record<string, unknown>>, field: 'input' | 'inputModalities'): ModelCapability {
  const modalities = model[field]
  return Array.isArray(modalities) && modalities.includes('image') ? 'vision' : 'text'
}

/** Materialize an explicit adapter modality declaration from the product choice. */
export function modelModalities(capability: ModelCapability): string[] {
  return capability === 'vision' ? ['text', 'image'] : ['text']
}

/** Props of the compact capability selector rendered on every model row. */
export interface ModelCapabilitySelectProps {
  model: Readonly<Record<string, unknown>>
  field: 'input' | 'inputModalities'
  index: number
  disabled: boolean
  t: (key: keyof typeof en) => string
  onChange: (value: string[]) => void
}

/** Render the routing classification that decides native vision versus image_vision. */
export function ModelCapabilitySelect(props: ModelCapabilitySelectProps): ReactNode {
  const capability = modelCapability(props.model, props.field)
  return (
    <select
      className={styles['modelCapabilitySelect']}
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

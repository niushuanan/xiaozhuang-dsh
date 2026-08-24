import { useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { companionFrameUrl } from './ProductCompanion.tsx'
import type { CompanionLocaleKey } from './locales.ts'
import {
  createCompanionStore,
  type CompanionAction, type CompanionSize, type CompanionSkin,
} from './store.ts'
import css from './ProductCompanionSettings.module.css'

type ProductCompanionSettingsProps =
  PropsRuntime<'settings.section'>
  & PropsStore<ReturnType<typeof createCompanionStore>>
  & PropsLocale<'productCompanion'>

const SKINS: readonly CompanionSkin[] = ['blue', 'black']
const SIZE_OPTIONS: readonly SelectorOption<CompanionSize>[] = [
  { id: 'standard', label: 'size.standard' },
  { id: 'large', label: 'size.large' },
]
const CLICK_OPTIONS: readonly SelectorOption<CompanionAction>[] = [
  { id: 'focusComposer', label: 'action.focusComposer' },
  { id: 'none', label: 'action.none' },
]
const DOUBLE_CLICK_OPTIONS: readonly SelectorOption<CompanionAction>[] = [
  { id: 'newSession', label: 'action.newSession' },
  { id: 'focusComposer', label: 'action.focusComposer' },
  { id: 'none', label: 'action.none' },
]
const CONTEXT_OPTIONS: readonly SelectorOption<CompanionAction>[] = [
  { id: 'menu', label: 'action.menu' },
  { id: 'newSession', label: 'action.newSession' },
  { id: 'close', label: 'action.close' },
  { id: 'none', label: 'action.none' },
]

interface SelectorOption<T extends string> {
  id: T
  label: CompanionLocaleKey
}

interface SelectorRowProps<T extends string> {
  label: CompanionLocaleKey
  hint: CompanionLocaleKey
  value: T
  options: readonly SelectorOption<T>[]
  onChange: (value: T) => void
  t: ProductCompanionSettingsProps['t']
}

function SelectorRow<T extends string>({
  label, hint, value, options, onChange, t,
}: SelectorRowProps<T>) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.id === value) ?? options[0]
  return (
    <div className={css.row}>
      <span className={css.rowCopy}>
        <strong>{t(label)}</strong>
        <span>{t(hint)}</span>
      </span>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={options.map(option => ({ id: option.id, label: t(option.label) }))}
        selectedId={value}
        onSelect={(id) => {
          setOpen(false)
          onChange(id as T)
        }}
        align="end"
        portal
        compact
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { setOpen(current => !current) }}
          >
            {selected === undefined ? '' : t(selected.label)}
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}

/** Dedicated settings page for the cross-page companion. */
export function ProductCompanionSettings({ useStore, actions, t }: ProductCompanionSettingsProps) {
  const skin = useStore(state => state.skin)
  const visible = useStore(state => state.visible ?? true)
  const size = useStore(state => state.size ?? 'large')
  const clickAction = useStore(state => state.clickAction ?? 'focusComposer')
  const doubleClickAction = useStore(state => state.doubleClickAction ?? 'newSession')
  const contextAction = useStore(state => state.contextAction ?? 'menu')
  // Persisted records created before these controls intentionally keep the new defaults.
  const showStatus = useStore(state => state.showStatus ?? true)

  return (
    <div className={css.section}>
      <div className={css.heading}>
        <h2>{t('title')}</h2>
        <p>{t('intro')}</p>
      </div>

      <section className={css.group} aria-labelledby="product-companion-appearance">
        <h3 id="product-companion-appearance">{t('appearance')}</h3>
        <div className={css.skinGrid} role="radiogroup" aria-label={t('appearance')}>
          {SKINS.map(candidate => (
            <button
              key={candidate}
              type="button"
              className={css.skinOption}
              role="radio"
              aria-checked={skin === candidate}
              data-selected={skin === candidate ? 'true' : 'false'}
              onClick={() => { actions.setSkin(candidate) }}
            >
              <span className={css.skinPreview}>
                <img src={companionFrameUrl(candidate, 'lounge')} alt="" draggable={false} />
              </span>
              <span className={css.skinCopy}>
                <strong>{t(`skin.${candidate}`)}</strong>
                <span>{t(`skin.${candidate}Hint`)}</span>
              </span>
              <span className={css.selectionMark} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className={css.rows}>
          <SelectorRow
            label="sizeLabel"
            hint="sizeHint"
            value={size}
            options={SIZE_OPTIONS}
            onChange={(value) => { actions.setSize?.(value) }}
            t={t}
          />
        </div>
      </section>

      <section className={css.group} aria-labelledby="product-companion-shortcuts">
        <h3 id="product-companion-shortcuts">{t('shortcuts')}</h3>
        <div className={css.rows}>
          <SelectorRow
            label="clickLabel"
            hint="clickHint"
            value={clickAction}
            options={CLICK_OPTIONS}
            onChange={(value) => { actions.setClickAction?.(value) }}
            t={t}
          />
          <SelectorRow
            label="doubleClickLabel"
            hint="doubleClickHint"
            value={doubleClickAction}
            options={DOUBLE_CLICK_OPTIONS}
            onChange={(value) => { actions.setDoubleClickAction?.(value) }}
            t={t}
          />
          <SelectorRow
            label="contextLabel"
            hint="contextHint"
            value={contextAction}
            options={CONTEXT_OPTIONS}
            onChange={(value) => { actions.setContextAction?.(value) }}
            t={t}
          />
        </div>
      </section>

      <section className={css.group} aria-labelledby="product-companion-behavior">
        <h3 id="product-companion-behavior">{t('behavior')}</h3>
        <label className={css.row}>
          <span className={css.rowCopy}>
            <strong>{t('visibleLabel')}</strong>
            <span>{t('visibleHint')}</span>
          </span>
          <input
            className={css.switch}
            type="checkbox"
            aria-label={t('visibleLabel')}
            checked={visible}
            onChange={(event) => { actions.setVisible(event.currentTarget.checked) }}
          />
        </label>
        <label className={css.row}>
          <span className={css.rowCopy}>
            <strong>{t('statusLabel')}</strong>
            <span>{t('statusHint')}</span>
          </span>
          <input
            className={css.switch}
            type="checkbox"
            aria-label={t('statusLabel')}
            checked={showStatus}
            onChange={(event) => { actions.setShowStatus(event.currentTarget.checked) }}
          />
        </label>
      </section>

      <p className={css.privacy}>{t('privacy')}</p>
    </div>
  )
}

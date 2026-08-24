import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconCloseOutline16, IconEditOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { companionFrameUrl } from './ProductCompanion.tsx'
import type { CompanionLocaleKey } from './locales.ts'
import {
  createCompanionStore,
  DEFAULT_COMPANION_NAME,
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
  params?: Record<string, unknown>
}

function SelectorRow<T extends string>({
  label, hint, value, options, onChange, t, params,
}: SelectorRowProps<T>) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.id === value) ?? options[0]
  return (
    <div className={css.row}>
      <span className={css.rowCopy}>
        <strong>{t(label, params)}</strong>
        <span>{t(hint, params)}</span>
      </span>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={options.map(option => ({ id: option.id, label: t(option.label, params) }))}
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
            {selected === undefined ? '' : t(selected.label, params)}
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
  const displayName = useStore(state => state.displayName?.trim() || DEFAULT_COMPANION_NAME)
  const visible = useStore(state => state.visible ?? true)
  const size = useStore(state => state.size ?? 'large')
  const clickAction = useStore(state => state.clickAction ?? 'focusComposer')
  const doubleClickAction = useStore(state => state.doubleClickAction ?? 'newSession')
  const contextAction = useStore(state => state.contextAction ?? 'menu')
  // Persisted records created before these controls intentionally keep the new defaults.
  const showStatus = useStore(state => state.showStatus ?? true)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)

  useEffect(() => {
    if (!editingName) setNameDraft(displayName)
  }, [displayName, editingName])

  const saveName = (): void => {
    actions.setDisplayName(nameDraft)
    setEditingName(false)
  }

  return (
    <div className={css.section}>
      <div className={css.heading}>
        {editingName ? (
          <form
            className={css.nameEditor}
            onSubmit={(event) => { event.preventDefault(); saveName() }}
          >
            <input
              autoFocus
              value={nameDraft}
              aria-label={t('nameInput')}
              onChange={(event) => { setNameDraft(event.currentTarget.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setNameDraft(displayName)
                  setEditingName(false)
                }
              }}
            />
            <button type="submit" aria-label={t('saveName')} title={t('saveName')}>
              <IconCheckOutline16 size={15} />
            </button>
            <button
              type="button"
              aria-label={t('cancelName')}
              title={t('cancelName')}
              onClick={() => { setNameDraft(displayName); setEditingName(false) }}
            >
              <IconCloseOutline16 size={15} />
            </button>
          </form>
        ) : (
          <div className={css.nameTitle}>
            <h2>{displayName}</h2>
            <button
              type="button"
              aria-label={t('editName')}
              title={t('editName')}
              onClick={() => { setEditingName(true) }}
            >
              <IconEditOutline16 size={15} />
            </button>
          </div>
        )}
        <p>{t('intro', { name: displayName })}</p>
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
            params={{ name: displayName }}
            t={t}
          />
        </div>
      </section>

      <section className={css.group} aria-labelledby="product-companion-behavior">
        <h3 id="product-companion-behavior">{t('behavior')}</h3>
        <label className={css.row}>
          <span className={css.rowCopy}>
            <strong>{t('visibleLabel', { name: displayName })}</strong>
            <span>{t('visibleHint')}</span>
          </span>
          <input
            className={css.switch}
            type="checkbox"
            aria-label={t('visibleLabel', { name: displayName })}
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

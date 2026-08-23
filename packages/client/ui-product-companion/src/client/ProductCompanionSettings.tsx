import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { companionFrameUrl } from './ProductCompanion.tsx'
import { createCompanionStore, type CompanionSkin } from './store.ts'
import css from './ProductCompanionSettings.module.css'

type ProductCompanionSettingsProps =
  PropsRuntime<'settings.section'>
  & PropsStore<ReturnType<typeof createCompanionStore>>
  & PropsLocale<'productCompanion'>

const SKINS: readonly CompanionSkin[] = ['blue', 'black']

/** Dedicated settings page for the cross-page companion. */
export function ProductCompanionSettings({ useStore, actions, t }: ProductCompanionSettingsProps) {
  const skin = useStore(state => state.skin)
  // Persisted records created before these controls intentionally keep the new defaults.
  const showStatus = useStore(state => state.showStatus ?? true)
  const autoTravel = useStore(state => state.autoTravel ?? true)

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
                <img src={companionFrameUrl(candidate, 'idle')} alt="" draggable={false} />
              </span>
              <span className={css.skinCopy}>
                <strong>{t(`skin.${candidate}`)}</strong>
                <span>{t(`skin.${candidate}Hint`)}</span>
              </span>
              <span className={css.selectionMark} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section className={css.group} aria-labelledby="product-companion-interaction">
        <h3 id="product-companion-interaction">{t('interaction')}</h3>
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
        <label className={css.row}>
          <span className={css.rowCopy}>
            <strong>{t('travelLabel')}</strong>
            <span>{t('travelHint')}</span>
          </span>
          <input
            className={css.switch}
            type="checkbox"
            aria-label={t('travelLabel')}
            checked={autoTravel}
            onChange={(event) => { actions.setAutoTravel(event.currentTarget.checked) }}
          />
        </label>
        <div className={css.row}>
          <span className={css.rowCopy}>
            <strong>{t('resetLabel')}</strong>
            <span>{t('resetHint')}</span>
          </span>
          <button className={css.textButton} type="button" onClick={() => { actions.resetPosition() }}>
            {t('resetAction')}
          </button>
        </div>
      </section>

      <p className={css.privacy}>{t('privacy')}</p>
    </div>
  )
}

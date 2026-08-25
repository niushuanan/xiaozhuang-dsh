import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconCloseOutline16, IconEditOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { companionFrameUrl } from './ProductCompanion.tsx'
import type { CompanionLocaleKey } from './locales.ts'
import {
  GlobalRulesRequestError, loadGlobalRules, saveGlobalRules, type GlobalRulesDocument,
} from './global-rules.ts'
import {
  createCompanionStore,
  DEFAULT_COMPANION_NAME, DEFAULT_VOICE_SHORTCUT,
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
  { id: 'voiceInput', label: 'action.voiceInput' },
  { id: 'none', label: 'action.none' },
]
const DOUBLE_CLICK_OPTIONS: readonly SelectorOption<CompanionAction>[] = [
  { id: 'newSession', label: 'action.newSession' },
  { id: 'voiceInput', label: 'action.voiceInput' },
  { id: 'focusComposer', label: 'action.focusComposer' },
  { id: 'none', label: 'action.none' },
]
const CONTEXT_OPTIONS: readonly SelectorOption<CompanionAction>[] = [
  { id: 'menu', label: 'action.menu' },
  { id: 'voiceInput', label: 'action.voiceInput' },
  { id: 'newSession', label: 'action.newSession' },
  { id: 'close', label: 'action.close' },
  { id: 'none', label: 'action.none' },
]

interface SelectorOption<T extends string> {
  id: T
  label: CompanionLocaleKey
}

function shortcutFromEvent(event: ReactKeyboardEvent): string | null {
  if (event.key === 'Escape') return ''
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return null
  const key = event.code === 'Space' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  const pieces = [
    event.metaKey ? 'Meta' : '',
    event.ctrlKey ? 'Control' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    key,
  ].filter(Boolean)
  return pieces.length > 1 ? pieces.join('+') : null
}

function displayShortcut(shortcut: string): string {
  return shortcut
    .replace('Meta', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replaceAll('+', '')
    .replace('Space', 'Space')
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
export function ProductCompanionSettings({ useStore, actions, setLabel, t }: ProductCompanionSettingsProps) {
  const skin = useStore(state => state.skin)
  // Persisted records from before custom naming can omit this field at runtime.
  const displayName = useStore(state => state.displayName?.trim() || DEFAULT_COMPANION_NAME)
  const visible = useStore(state => state.visible ?? true)
  const size = useStore(state => state.size ?? 'large')
  const clickAction = useStore(state => state.clickAction ?? 'focusComposer')
  const doubleClickAction = useStore(state => state.doubleClickAction ?? 'newSession')
  const contextAction = useStore(state => state.contextAction ?? 'menu')
  // Persisted records created before these controls intentionally keep the new defaults.
  const showStatus = useStore(state => state.showStatus ?? true)
  const voiceEnabled = useStore(state => state.voiceEnabled ?? true)
  const voiceShortcut = useStore(state => state.voiceShortcut ?? DEFAULT_VOICE_SHORTCUT)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const shortcutRef = useRef<HTMLButtonElement>(null)
  const [rulesDocument, setRulesDocument] = useState<GlobalRulesDocument | null>(null)
  const [rulesDraft, setRulesDraft] = useState('')
  const [rulesStatus, setRulesStatus] = useState<'idle' | 'loading' | 'ready' | 'saving' | 'error' | 'conflict'>('idle')
  const [rulesReload, setRulesReload] = useState(0)
  const rulesDirty = rulesDocument !== null && rulesDraft !== rulesDocument.content
  const rulesDirtyRef = useRef(rulesDirty)
  const rulesStatusRef = useRef(rulesStatus)
  rulesDirtyRef.current = rulesDirty
  rulesStatusRef.current = rulesStatus

  useEffect(() => {
    if (!editingName) setNameDraft(displayName)
  }, [displayName, editingName])

  useEffect(() => { setLabel?.(displayName) }, [displayName, setLabel])

  useEffect(() => {
    if (!recordingShortcut) return
    shortcutRef.current?.focus()
  }, [recordingShortcut])

  useEffect(() => {
    const controller = new AbortController()
    setRulesStatus(current => current === 'idle' ? 'loading' : current)
    void loadGlobalRules(controller.signal).then(
      (document) => {
        if (rulesDirtyRef.current) return
        setRulesDocument(document)
        setRulesDraft(document.content)
        setRulesStatus('ready')
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('[product-companion global rules] load failed:', error)
        setRulesStatus('error')
      },
    )
    return () => { controller.abort() }
  }, [rulesReload])

  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState !== 'visible' || rulesDirtyRef.current
        || rulesStatusRef.current === 'loading' || rulesStatusRef.current === 'saving') return
      setRulesReload(value => value + 1)
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const interval = window.setInterval(refresh, 5_000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(interval)
    }
  }, [])

  const saveName = (): void => {
    actions.setDisplayName(nameDraft)
    setEditingName(false)
  }

  const shortcutOptions = voiceEnabled
    ? CLICK_OPTIONS
    : CLICK_OPTIONS.filter(option => option.id !== 'voiceInput')
  const doubleClickOptions = voiceEnabled
    ? DOUBLE_CLICK_OPTIONS
    : DOUBLE_CLICK_OPTIONS.filter(option => option.id !== 'voiceInput')
  const contextOptions = voiceEnabled
    ? CONTEXT_OPTIONS
    : CONTEXT_OPTIONS.filter(option => option.id !== 'voiceInput')

  const persistGlobalRules = async (): Promise<void> => {
    if (rulesDocument === null || !rulesDirty || rulesStatus === 'saving' || rulesStatus === 'conflict') return
    setRulesStatus('saving')
    try {
      const saved = await saveGlobalRules({
        content: rulesDraft,
        revision: rulesDocument.revision,
      })
      setRulesDocument(saved)
      setRulesDraft(saved.content)
      setRulesStatus('ready')
    } catch (error) {
      console.warn('[product-companion global rules] save failed:', error)
      setRulesStatus(error instanceof GlobalRulesRequestError && error.status === 409 ? 'conflict' : 'error')
    }
  }

  const loadLatestGlobalRules = (): void => {
    setRulesDocument(null)
    setRulesDraft('')
    setRulesStatus('loading')
    setRulesReload(value => value + 1)
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
            onChange={(value) => { actions.setSize(value) }}
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
            options={shortcutOptions}
            onChange={(value) => { actions.setClickAction(value) }}
            t={t}
          />
          <SelectorRow
            label="doubleClickLabel"
            hint="doubleClickHint"
            value={doubleClickAction}
            options={doubleClickOptions}
            onChange={(value) => { actions.setDoubleClickAction(value) }}
            t={t}
          />
          <SelectorRow
            label="contextLabel"
            hint="contextHint"
            value={contextAction}
            options={contextOptions}
            onChange={(value) => { actions.setContextAction(value) }}
            params={{ name: displayName }}
            t={t}
          />
        </div>
      </section>

      <section className={css.group} aria-labelledby="product-companion-global-rules">
        <h3 id="product-companion-global-rules">{t('rules.title')}</h3>
        <div className={css.rulesSurface}>
          <div className={css.rulesHeader}>
            <span className={css.rowCopy}>
              <strong>AGENTS.md</strong>
              <span>{t('rules.hint', { path: rulesDocument?.displayPath ?? '~/.dsh/AGENTS.md' })}</span>
            </span>
          </div>

          {rulesStatus === 'loading' ? <p className={css.rulesNotice}>{t('rules.loading')}</p> : null}
          {rulesStatus === 'error' ? (
            <p className={css.rulesError} role="alert">
              {t('rules.error')}
              <button type="button" className={css.textButton} onClick={loadLatestGlobalRules}>{t('rules.retry')}</button>
            </p>
          ) : null}
          {rulesStatus === 'conflict' ? (
            <p className={css.rulesError} role="alert">
              {t('rules.conflict')}
              <button type="button" className={css.textButton} onClick={loadLatestGlobalRules}>{t('rules.loadLatest')}</button>
            </p>
          ) : null}
          {rulesDocument !== null ? (
            <>
              <textarea
                className={css.rulesEditor}
                aria-label={t('rules.editorLabel')}
                value={rulesDraft}
                spellCheck={false}
                placeholder={t('rules.placeholder')}
                onChange={(event) => {
                  setRulesDraft(event.currentTarget.value)
                  if (rulesStatus === 'error') setRulesStatus('ready')
                }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault()
                    void persistGlobalRules()
                  }
                }}
              />
              <div className={css.rulesFooter}>
                <span aria-live="polite">
                  {rulesStatus === 'saving'
                    ? t('rules.saving')
                    : rulesDirty ? t('rules.unsaved') : t('rules.saved')}
                </span>
                <button
                  type="button"
                  className={css.primaryButton}
                  disabled={!rulesDirty || rulesStatus === 'saving' || rulesStatus === 'conflict'}
                  onClick={() => { void persistGlobalRules() }}
                >{t('rules.save')}</button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className={css.group} aria-labelledby="product-companion-voice">
        <h3 id="product-companion-voice">{t('voice.title')}</h3>
        <div className={css.voiceSurface} data-enabled={voiceEnabled ? 'true' : 'false'}>
          <label className={css.row}>
            <span className={css.rowCopy}>
              <strong>{t('voice.enabledLabel')}</strong>
              <span>{t('voice.enabledHint', { name: displayName })}</span>
            </span>
            <input
              className={css.switch}
              type="checkbox"
              aria-label={t('voice.enabledLabel')}
              checked={voiceEnabled}
              onChange={(event) => { actions.setVoiceEnabled(event.currentTarget.checked) }}
            />
          </label>

          {voiceEnabled ? (
            <div className={css.voiceDetails}>
              <div className={css.row}>
                <span className={css.rowCopy}>
                  <strong>{t('voice.shortcutLabel')}</strong>
                  <span>{recordingShortcut ? t('voice.shortcutRecording') : t('voice.shortcutHintSetting')}</span>
                </span>
                <button
                  ref={shortcutRef}
                  type="button"
                  className={css.shortcutRecorder}
                  data-voice-shortcut-recording={recordingShortcut ? 'true' : undefined}
                  onClick={() => { setRecordingShortcut(true) }}
                  onBlur={() => { setRecordingShortcut(false) }}
                  onKeyDown={(event) => {
                    if (!recordingShortcut) return
                    event.preventDefault()
                    event.stopPropagation()
                    const shortcut = shortcutFromEvent(event)
                    if (shortcut === null) return
                    if (shortcut.length > 0) actions.setVoiceShortcut(shortcut)
                    setRecordingShortcut(false)
                  }}
                >
                  {recordingShortcut ? t('voice.shortcutWaiting') : displayShortcut(voiceShortcut)}
                </button>
              </div>
              <p className={css.voicePrivacy}>{t('voice.privacy')}</p>
            </div>
          ) : null}
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

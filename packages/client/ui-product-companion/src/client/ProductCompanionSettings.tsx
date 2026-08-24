import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconCloseOutline16, IconEditOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { companionFrameUrl } from './ProductCompanion.tsx'
import type { CompanionLocaleKey } from './locales.ts'
import {
  loadProjectRules, ProjectRulesRequestError, saveProjectRules, type ProjectRulesDocument,
} from './project-rules.ts'
import {
  createCompanionStore,
  DEFAULT_COMPANION_NAME, DEFAULT_VOICE_INSTRUCTION, DEFAULT_VOICE_SHORTCUT,
  type CompanionAction, type CompanionSize, type CompanionSkin, type VoiceUsageStats,
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

interface VoiceModelGroup {
  id: string
  name: string
  models: Array<{ id: string; name: string }>
}

const AUTO_MODEL = '__auto__'

function modelKey(provider: string, model: string): string {
  return JSON.stringify([provider, model])
}

function modelSelection(key: string): { provider: string; model: string } | null {
  if (key === AUTO_MODEL) return { provider: '', model: '' }
  try {
    const parsed = JSON.parse(key) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const provider = parsed[0] as unknown
    const model = parsed[1] as unknown
    return typeof provider === 'string' && typeof model === 'string' ? { provider, model } : null
  } catch {
    return null
  }
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

function formatStatDuration(seconds: number, t: ProductCompanionSettingsProps['t']): string {
  const rounded = Math.max(0, Math.round(seconds))
  if (rounded < 60) return t('voice.stats.seconds', { count: rounded })
  const minutes = Math.floor(rounded / 60)
  return t('voice.stats.minutes', { count: minutes })
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
export function ProductCompanionSettings({ useSessions, useStore, actions, setLabel, t }: ProductCompanionSettingsProps) {
  const projectCwd = useSessions((state) => {
    const current = state.current
    return current === undefined ? undefined : state.byId[current]?.cwd
  })
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
  const voiceProcessing = useStore(state => state.voiceProcessing ?? true)
  const voiceProvider = useStore(state => state.voiceProvider ?? '')
  const voiceModel = useStore(state => state.voiceModel ?? '')
  const voiceInstruction = useStore(state => state.voiceInstruction ?? DEFAULT_VOICE_INSTRUCTION)
  const voiceShortcut = useStore(state => state.voiceShortcut ?? DEFAULT_VOICE_SHORTCUT)
  const voiceStats = useStore(state => state.voiceStats ?? {
    sessions: 0, spokenSeconds: 0, processedChars: 0, estimatedSavedSeconds: 0,
  } satisfies VoiceUsageStats)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)
  const [instructionDraft, setInstructionDraft] = useState(voiceInstruction)
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const shortcutRef = useRef<HTMLButtonElement>(null)
  const [modelGroups, setModelGroups] = useState<VoiceModelGroup[]>([])
  const [modelsStatus, setModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [rulesDocument, setRulesDocument] = useState<ProjectRulesDocument | null>(null)
  const [rulesDraft, setRulesDraft] = useState('')
  const [rulesStatus, setRulesStatus] = useState<'idle' | 'loading' | 'ready' | 'saving' | 'error' | 'conflict'>('idle')
  const [rulesReload, setRulesReload] = useState(0)

  useEffect(() => {
    if (!editingName) setNameDraft(displayName)
  }, [displayName, editingName])

  useEffect(() => { setLabel?.(displayName) }, [displayName, setLabel])

  useEffect(() => { setInstructionDraft(voiceInstruction) }, [voiceInstruction])

  useEffect(() => {
    if (!recordingShortcut) return
    shortcutRef.current?.focus()
  }, [recordingShortcut])

  useEffect(() => {
    if (!voiceEnabled) return
    const controller = new AbortController()
    setModelsStatus('loading')
    void fetch('/plugins/ui-product-companion/api/voice/models', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        const body = await response.json() as { groups?: unknown }
        if (!Array.isArray(body.groups)) throw new Error('invalid model catalog')
        setModelGroups(body.groups as VoiceModelGroup[])
        setModelsStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('[product-companion voice] model catalog failed:', error)
        setModelsStatus('error')
      })
    return () => { controller.abort() }
  }, [voiceEnabled])

  useEffect(() => {
    if (projectCwd === undefined || projectCwd.length === 0) {
      setRulesDocument(null)
      setRulesDraft('')
      setRulesStatus('idle')
      return
    }
    const controller = new AbortController()
    setRulesDocument(null)
    setRulesDraft('')
    setRulesStatus('loading')
    void loadProjectRules(projectCwd, controller.signal).then(
      (document) => {
        setRulesDocument(document)
        setRulesDraft(document.content)
        setRulesStatus('ready')
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('[product-companion project rules] load failed:', error)
        setRulesDocument(null)
        setRulesDraft('')
        setRulesStatus('error')
      },
    )
    return () => { controller.abort() }
  }, [projectCwd, rulesReload])

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
  const selectedModelKey = voiceProvider.length > 0 && voiceModel.length > 0
    ? modelKey(voiceProvider, voiceModel)
    : AUTO_MODEL
  const modelItems = [
    { id: AUTO_MODEL, label: t('voice.modelAuto') },
    ...modelGroups.flatMap(group => group.models.map(model => ({
      id: modelKey(group.id, model.id),
      label: `${model.name} · ${group.name}`,
    }))),
  ]
  const selectedModelLabel = modelItems.find(item => item.id === selectedModelKey)?.label
    ?? (modelsStatus === 'loading' ? t('voice.modelLoading') : t('voice.modelAuto'))
  const rulesDirty = rulesDocument !== null && rulesDraft !== rulesDocument.content
  const projectLabel = projectCwd?.replace(/[/\\]+$/u, '').split(/[/\\]/u).pop() ?? projectCwd

  const persistProjectRules = async (): Promise<void> => {
    if (rulesDocument === null || !rulesDirty || rulesStatus === 'saving' || rulesStatus === 'conflict') return
    setRulesStatus('saving')
    try {
      const saved = await saveProjectRules({
        cwd: rulesDocument.cwd,
        content: rulesDraft,
        revision: rulesDocument.revision,
      })
      setRulesDocument(saved)
      setRulesDraft(saved.content)
      setRulesStatus('ready')
    } catch (error) {
      console.warn('[product-companion project rules] save failed:', error)
      setRulesStatus(error instanceof ProjectRulesRequestError && error.status === 409 ? 'conflict' : 'error')
    }
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

      <section className={css.group} aria-labelledby="product-companion-project-rules">
        <h3 id="product-companion-project-rules">{t('rules.title')}</h3>
        <div className={css.rulesSurface}>
          <div className={css.rulesHeader}>
            <span className={css.rowCopy}>
              <strong>AGENTS.md</strong>
              <span>{projectCwd === undefined ? t('rules.noProject') : t('rules.hint', { project: projectLabel })}</span>
            </span>
            {rulesDocument !== null ? (
              <button
                type="button"
                className={css.textButton}
                disabled={rulesStatus === 'loading' || rulesStatus === 'saving'}
                onClick={() => { setRulesReload(value => value + 1) }}
              >{t('rules.reload')}</button>
            ) : null}
          </div>

          {projectCwd !== undefined ? (
            <>
              {rulesStatus === 'loading' ? <p className={css.rulesNotice}>{t('rules.loading')}</p> : null}
              {rulesStatus === 'error' ? <p className={css.rulesError} role="alert">{t('rules.error')}</p> : null}
              {rulesStatus === 'conflict' ? <p className={css.rulesError} role="alert">{t('rules.conflict')}</p> : null}
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
                        void persistProjectRules()
                      }
                    }}
                  />
                  <div className={css.rulesFooter}>
                    <span aria-live="polite">
                      {rulesStatus === 'saving'
                        ? t('rules.saving')
                        : rulesDirty
                          ? t('rules.unsaved')
                          : rulesDocument.exists ? t('rules.saved') : t('rules.createHint')}
                    </span>
                    <button
                      type="button"
                      className={css.primaryButton}
                      disabled={!rulesDirty || rulesStatus === 'saving' || rulesStatus === 'conflict'}
                      onClick={() => { void persistProjectRules() }}
                    >{rulesDocument.exists ? t('rules.save') : t('rules.create')}</button>
                  </div>
                </>
              ) : null}
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
              <label className={css.row}>
                <span className={css.rowCopy}>
                  <strong>{t('voice.processingLabel')}</strong>
                  <span>{t('voice.processingHint')}</span>
                </span>
                <input
                  className={css.switch}
                  type="checkbox"
                  aria-label={t('voice.processingLabel')}
                  checked={voiceProcessing}
                  onChange={(event) => { actions.setVoiceProcessing(event.currentTarget.checked) }}
                />
              </label>

              {voiceProcessing ? (
                <>
                  <div className={css.row}>
                    <span className={css.rowCopy}>
                      <strong>{t('voice.modelLabel')}</strong>
                      <span>{modelsStatus === 'error' ? t('voice.modelError') : t('voice.modelHint')}</span>
                    </span>
                    <Menu
                      open={modelMenuOpen}
                      onClose={() => { setModelMenuOpen(false) }}
                      items={modelItems}
                      selectedId={selectedModelKey}
                      onSelect={(id) => {
                        setModelMenuOpen(false)
                        const selected = modelSelection(id)
                        if (selected !== null) actions.setVoiceModel(selected.provider, selected.model)
                      }}
                      align="end"
                      portal
                      compact
                      anchor={(
                        <button
                          type="button"
                          className={`${css.selector} ${css.modelSelector}`}
                          aria-haspopup="menu"
                          aria-expanded={modelMenuOpen}
                          onClick={() => { setModelMenuOpen(current => !current) }}
                        >
                          <span>{selectedModelLabel}</span>
                          <IconChevronDownOutline14 className={css.chevron} />
                        </button>
                      )}
                    />
                  </div>

                  <label className={css.promptField}>
                    <span className={css.rowCopy}>
                      <strong>{t('voice.promptLabel')}</strong>
                      <span>{t('voice.promptHint', { name: displayName })}</span>
                    </span>
                    <textarea
                      aria-label={t('voice.promptLabel')}
                      value={instructionDraft}
                      maxLength={4_000}
                      onChange={(event) => { setInstructionDraft(event.currentTarget.value) }}
                      onBlur={() => { actions.setVoiceInstruction(instructionDraft) }}
                    />
                  </label>
                </>
              ) : null}

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

              <div className={css.statsHeader}>
                <span>{t('voice.statsTitle')}</span>
                {voiceStats.sessions > 0 ? (
                  <button type="button" onClick={() => { actions.resetVoiceStats() }}>
                    {t('voice.statsReset')}
                  </button>
                ) : null}
              </div>
              <div className={css.statsGrid}>
                <span><strong>{voiceStats.sessions}</strong><small>{t('voice.statsSessions')}</small></span>
                <span><strong>{voiceStats.processedChars.toLocaleString()}</strong><small>{t('voice.statsChars')}</small></span>
                <span><strong>{formatStatDuration(voiceStats.estimatedSavedSeconds, t)}</strong><small>{t('voice.statsSaved')}</small></span>
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

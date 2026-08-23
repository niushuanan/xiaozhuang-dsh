import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  ComputerUseIcon,
  IconBrowseOutline16, IconCheckOutline14, IconChevronLeftOutline14,
  IconChevronRightOutline14, IconCloseOutline16, IconFullscreenOutline16,
  IconGlobeOutline14, IconLoadingOutline16, IconPauseOutline16, IconPlayOutline16,
  IconPlusOutline16, IconRefreshOutline14, IconSearchOutline16, IconSettingsOutline14,
  IconWarningOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ComputerUseLocaleKey } from './locales.ts'
import type { ComputerUsePreferences, ComputerUseStatus } from './ComputerUseSettings.tsx'
import { useWorkspaceUi, workspaceUi } from './workspace-store.ts'
import css from './BrowserWorkspace.module.css'

export interface BrowserWorkspaceStep {
  id: string
  action: string
  detail: string
  status: 'running' | 'complete' | 'error'
  startedAt: number
  finishedAt?: number
}

export interface BrowserWorkspaceState {
  sessionId: string
  mode: 'isolated' | 'connected'
  active: boolean
  paused: boolean
  running: boolean
  action?: string
  title?: string
  url?: string
  text: string
  hasScreenshot: boolean
  screenshotVersion: number
  updatedAt: number
  tabs: readonly BrowserWorkspaceTab[]
  steps: readonly BrowserWorkspaceStep[]
}

export interface BrowserWorkspaceTab {
  id: string
  title: string
  url: string
  active: boolean
  closable: boolean
}

export interface BrowserWorkspaceResponse {
  state?: BrowserWorkspaceState
  enabled: boolean
}

export interface BrowserWorkspaceAction {
  sessionId: string
  mode: 'isolated' | 'connected'
  action: string
  args?: Record<string, unknown>
}

export interface BrowserWorkspaceInjected {
  settings: SettingsScope<ComputerUsePreferences>
  status: () => Promise<ComputerUseStatus>
  workspace: (sessionId: string) => Promise<BrowserWorkspaceResponse>
  act: (request: BrowserWorkspaceAction) => Promise<BrowserWorkspaceState>
  screenshotUrl: (sessionId: string, version: number) => string
}

type WorkspaceProps = PropsRuntime<'conversation.session.workspace'>
  & PropsLocale<'settings.computerUse'>
  & InjectFace<BrowserWorkspaceInjected>

type TriggerProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<'settings.computerUse'>

const ACTION_LABELS: Record<string, ComputerUseLocaleKey> = {
  open: 'workspaceStepOpen',
  new_tab: 'workspaceStepNewPage',
  use_tab: 'workspaceStepUsePage',
  close_tab: 'workspaceStepClosePage',
  snapshot: 'workspaceStepSnapshot',
  click: 'workspaceStepClick',
  click_point: 'workspaceStepClick',
  fill: 'workspaceStepFill',
  press_key: 'workspaceStepKey',
  scroll: 'workspaceStepScroll',
  go_back: 'workspaceStepBack',
  go_forward: 'workspaceStepForward',
  reload: 'workspaceStepReload',
  close: 'workspaceStepClose',
}

function time(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(value)
}

function modeLabel(mode: 'isolated' | 'connected', t: WorkspaceProps['t']): string {
  return mode === 'isolated' ? t('isolatedShort') : 'Chrome'
}

function addressToUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//iu.test(trimmed)) return trimmed
  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/iu.test(trimmed)
  const domain = /^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/u.test(trimmed)
  if (!/\s/u.test(trimmed) && (local || domain)) return `${local ? 'http' : 'https'}://${trimmed}`
  return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`
}

function supportsConnectedPages(version: string | undefined): boolean {
  const match = /^(\d+)\.(\d+)/u.exec(version ?? '')
  if (match === null) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 1 || (major === 1 && minor >= 2)
}

export function BrowserWorkspaceTrigger({ sessionId, t }: TriggerProps) {
  const ui = useWorkspaceUi(String(sessionId))
  return (
    <Tooltip label={t('workspaceTitle')}>
      <button
        type="button"
        className={css.trigger}
        data-open={ui.open ? 'true' : 'false'}
        aria-label={t('workspaceTitle')}
        aria-pressed={ui.open}
        onClick={() => { workspaceUi.toggle(String(sessionId)) }}
      >
        <ComputerUseIcon size={14} />
        <span>{t('workspaceTrigger')}</span>
      </button>
    </Tooltip>
  )
}

export function BrowserWorkspace({
  sessionId, settings, status, workspace, act, screenshotUrl, t,
}: WorkspaceProps) {
  const id = String(sessionId)
  const ui = useWorkspaceUi(id)
  const preferencesSnapshot = useSyncExternalStore(
    listener => settings.subscribe(listener),
    () => settings.getSnapshot(),
    () => settings.getSnapshot(),
  )
  const preferences = preferencesSnapshot.value
  const [state, setState] = useState<BrowserWorkspaceState | undefined>()
  const [runtime, setRuntime] = useState<ComputerUseStatus | undefined>()
  const [sourceOverride, setSourceOverride] = useState<'isolated' | 'connected' | undefined>()
  const [address, setAddress] = useState('')
  const [editingAddress, setEditingAddress] = useState(false)
  const [interactive, setInteractive] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tab, setTab] = useState<'steps' | 'elements' | 'screenshot'>('steps')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [headerTooltipsReady, setHeaderTooltipsReady] = useState(false)
  const previousActive = useRef(false)
  const workspaceRef = useRef<HTMLElement>(null)
  const addressRef = useRef<HTMLInputElement>(null)
  const [renderedWidth, setRenderedWidth] = useState(ui.width)

  const refresh = useCallback(async () => {
    const next = await workspace(id)
    setState(next.state)
    const active = next.state?.active === true
    if (active && !previousActive.current) workspaceUi.open(id)
    previousActive.current = active
  }, [id, workspace])

  useEffect(() => {
    let live = true
    const read = (): void => {
      void refresh().catch(() => { if (live) setError(t('workspaceLoadFailed')) })
    }
    read()
    const timer = window.setInterval(read, ui.open ? 1000 : 3000)
    return () => { live = false; window.clearInterval(timer) }
  }, [refresh, t, ui.open])

  useEffect(() => {
    let live = true
    const read = (): void => {
      void status().then(
        (value) => { if (live) setRuntime(value) },
        () => { if (live) setRuntime(undefined) },
      )
    }
    read()
    const timer = window.setInterval(read, 5000)
    return () => { live = false; window.clearInterval(timer) }
  }, [status])

  useEffect(() => {
    const element = workspaceRef.current
    if (element === null) return
    const measure = (): void => { setRenderedWidth(Math.round(element.getBoundingClientRect().width)) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [ui.open])

  useEffect(() => {
    if (ui.open) setHeaderTooltipsReady(false)
  }, [ui.open])

  useEffect(() => {
    if (!editingAddress && state?.url !== undefined) setAddress(state.url)
  }, [editingAddress, state?.url])

  useEffect(() => {
    if (sourceOverride === state?.mode) setSourceOverride(undefined)
  }, [sourceOverride, state?.mode])

  const mode = sourceOverride ?? state?.mode ?? preferences?.defaultBrowserMode ?? 'isolated'
  const writable = preferencesSnapshot.writable && preferences !== undefined

  const run = useCallback(async (
    action: string,
    args: Record<string, unknown> = {},
    source: 'isolated' | 'connected' = mode,
  ) => {
    setPending(true)
    setError(null)
    try {
      const next = await act({ sessionId: id, mode: source, action, args })
      setState(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPending(false)
    }
  }, [act, id, mode])

  const submitAddress = (): void => {
    const trimmed = address.trim()
    if (trimmed === '') return
    const url = addressToUrl(trimmed)
    setAddress(url)
    void run('open', { url })
  }

  const newPage = (): void => {
    setAddress('')
    setEditingAddress(true)
    void run('new_tab').then(() => { addressRef.current?.focus() })
  }

  const resize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = workspaceRef.current?.getBoundingClientRect().width ?? ui.width
    const move = (pointer: PointerEvent): void => {
      workspaceUi.setWidth(id, startWidth + startX - pointer.clientX)
    }
    const done = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', done)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', done)
  }

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const width = workspaceRef.current?.getBoundingClientRect().width ?? ui.width
    workspaceUi.setWidth(id, width + (event.key === 'ArrowLeft' ? 32 : -32))
  }

  if (!ui.open) return null

  const steps = [...(state?.steps ?? [])].reverse()
  const sourceConnected = mode === 'isolated'
    ? runtime?.isolatedBrowser.available === true
    : runtime?.connectedBrowser.connected === true
  const pagesAvailable = mode === 'isolated' || supportsConnectedPages(runtime?.connectedBrowser.version)
  const panelStyle = { '--computer-use-workspace-width': `${ui.width}px` } as CSSProperties

  return (
    <aside
      ref={workspaceRef}
      className={css.workspace}
      data-expanded={ui.expanded ? 'true' : 'false'}
      style={panelStyle}
      aria-label={t('workspaceTitle')}
    >
      <div
        className={css.resizeHandle}
        role="separator"
        tabIndex={0}
        aria-label={t('workspaceResize')}
        aria-orientation="vertical"
        aria-valuemin={340}
        aria-valuemax={1000}
        aria-valuenow={renderedWidth}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={resize}
      />
      <header className={css.workspaceHeader} onPointerLeave={() => { setHeaderTooltipsReady(true) }}>
        <div className={css.workspaceIdentity}>
          <strong>{t('workspaceTitle')}</strong>
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('workspaceSettings')}
            aria-expanded={settingsOpen}
            onClick={() => { setSettingsOpen(value => !value) }}
          ><IconSettingsOutline14 /></button>
        </div>
        <div className={css.modeSwitch} aria-label={t('workspaceSource')}>
          {(['isolated', 'connected'] as const).map(value => (
            <button
              key={value}
              type="button"
              data-selected={mode === value ? 'true' : 'false'}
              disabled={!writable}
              onClick={() => {
                if (value === 'connected' && runtime?.connectedBrowser.connected !== true) {
                  setError(t('workspaceDisconnected'))
                  return
                }
                setSourceOverride(value)
                void settings.set('defaultBrowserMode', value)
                if (state?.active === true) void run('snapshot', {}, value)
              }}
            >{modeLabel(value, t)}</button>
          ))}
        </div>
        <span className={css.connection} data-connected={sourceConnected ? 'true' : 'false'}>
          {sourceConnected ? t('workspaceConnected') : t('workspaceDisconnected')}
        </span>
        <div className={css.headerActions}>
          <Tooltip label={t('workspaceExpand')} delayMs={400} disabled={!headerTooltipsReady}>
            <button className={css.iconButton} type="button" aria-label={t('workspaceExpand')} onClick={() => {
              workspaceUi.toggleExpanded(id)
            }}><IconFullscreenOutline16 size={14} /></button>
          </Tooltip>
          <Tooltip label={t('workspaceClose')} delayMs={400} disabled={!headerTooltipsReady}>
            <button className={css.iconButton} type="button" aria-label={t('workspaceClose')} onClick={() => {
              workspaceUi.close(id)
            }}><IconCloseOutline16 size={14} /></button>
          </Tooltip>
        </div>
      </header>

      {settingsOpen ? (
        <div className={css.settingsPopover}>
          <div className={css.settingsSummary}>
            <strong>{t('workspaceSettings')}</strong>
            <span>{runtime?.desktop.accessibility === 'granted' ? t('permissionReady') : t('permissionMissing')} · {runtime?.connectedBrowser.connected === true ? t('connected') : t('disconnected')}</span>
          </div>
          <label className={css.settingRow}>
            <span>{t('desktopControl')}</span>
            <input
              className={css.switch}
              type="checkbox"
              checked={preferences?.desktopEnabled ?? false}
              disabled={!writable}
              onChange={(event) => { void settings.set('desktopEnabled', event.currentTarget.checked) }}
            />
          </label>
          <label className={css.settingRow}>
            <span>{t('browserControl')}</span>
            <input
              className={css.switch}
              type="checkbox"
              checked={preferences?.browserEnabled ?? true}
              disabled={!writable}
              onChange={(event) => { void settings.set('browserEnabled', event.currentTarget.checked) }}
            />
          </label>
        </div>
      ) : null}

      <div className={css.pageTabs} role="tablist" aria-label={t('workspacePages')}>
        <div className={css.pageTabsScroll}>
          {(state?.tabs ?? []).map(page => (
            <div className={css.pageTab} data-active={page.active ? 'true' : 'false'} key={page.id}>
              <button
                type="button"
                className={css.pageTabMain}
                role="tab"
                aria-selected={page.active}
                title={page.title}
                onClick={() => { if (!page.active) void run('use_tab', { tabId: page.id }) }}
              >
                <IconGlobeOutline14 size={12} />
                <span>{page.title || t('workspaceUntitledPage')}</span>
              </button>
              {page.closable ? (
                <button
                  type="button"
                  className={css.pageTabClose}
                  aria-label={t('workspaceClosePage', { title: page.title || t('workspaceUntitledPage') })}
                  onClick={() => { void run('close_tab', { tabId: page.id }) }}
                ><IconCloseOutline16 size={11} /></button>
              ) : null}
            </div>
          ))}
        </div>
        <Tooltip label={t(pagesAvailable ? 'workspaceNewPage' : 'workspaceUpdateBridge')} side="bottom" delayMs={400}>
          <button className={css.newPageButton} type="button" aria-label={t(pagesAvailable ? 'workspaceNewPage' : 'workspaceUpdateBridge')} disabled={pending || !pagesAvailable} onClick={newPage}>
            <IconPlusOutline16 size={13} />
          </button>
        </Tooltip>
      </div>

      <div className={css.browserToolbar}>
        <button className={css.iconButton} type="button" aria-label={t('workspaceBack')} disabled={pending} onClick={() => { void run('go_back') }}>
          <IconChevronLeftOutline14 />
        </button>
        <button className={css.iconButton} type="button" aria-label={t('workspaceForward')} disabled={pending} onClick={() => { void run('go_forward') }}>
          <IconChevronRightOutline14 />
        </button>
        <button className={css.iconButton} type="button" aria-label={t('workspaceReload')} disabled={pending} onClick={() => { void run('reload') }}>
          <IconRefreshOutline14 />
        </button>
        <div className={css.addressShell}>
          <IconSearchOutline16 size={13} className={css.addressIcon} />
          <input
            ref={addressRef}
            className={css.address}
            aria-label={t('workspaceAddress')}
            value={address}
            placeholder={t('workspaceAddressPlaceholder')}
            onFocus={() => { setEditingAddress(true) }}
            onBlur={() => { setEditingAddress(false) }}
            onChange={(event) => { setAddress(event.currentTarget.value) }}
            onKeyDown={(event) => { if (event.key === 'Enter') submitAddress() }}
          />
        </div>
      </div>

      <div className={css.viewport} data-interactive={interactive ? 'true' : 'false'}>
        {state?.hasScreenshot === true ? (
          <button
            className={css.screenshotButton}
            type="button"
            aria-label={interactive ? t('workspaceClickPage') : t('workspacePreview')}
            disabled={!interactive || pending}
            onClick={(event) => {
              if (!interactive) return
              const box = event.currentTarget.getBoundingClientRect()
              void run('click_point', {
                xRatio: (event.clientX - box.left) / box.width,
                yRatio: (event.clientY - box.top) / box.height,
              })
            }}
          >
            <img src={screenshotUrl(id, state.screenshotVersion)} alt={state.title ?? t('workspacePreview')} />
          </button>
        ) : (
          <div className={css.emptyViewport}>
            <IconBrowseOutline16 size={22} />
            <strong>{t('workspaceEmpty')}</strong>
            <span>{t('workspaceEmptyHint')}</span>
          </div>
        )}
        {pending || state?.running === true ? <div className={css.loadingBar} /> : null}
      </div>

      <div className={css.actionStrip}>
        <strong>{t('workspaceStepCount', { count: state?.steps.length ?? 0 })}</strong>
        <span>{state?.paused === true ? t('workspacePaused') : state?.running === true ? t('workspaceRunning') : t('workspaceObserving')}</span>
        <div className={css.stripActions}>
          <button type="button" disabled={pending} onClick={() => {
            void run(state?.paused === true ? 'resume' : 'pause')
          }}>
            {state?.paused === true ? <IconPlayOutline16 size={13} /> : <IconPauseOutline16 size={13} />}
            {state?.paused === true ? t('workspaceResume') : t('workspacePause')}
          </button>
          <button type="button" data-active={interactive ? 'true' : 'false'} onClick={() => { setInteractive(value => !value) }}>
            {t(interactive ? 'workspaceRelease' : 'workspaceTakeover')}
          </button>
        </div>
      </div>

      <div className={css.inspector}>
        <div className={css.inspectorTabs} role="tablist">
          {([
            ['steps', 'workspaceSteps'], ['elements', 'workspaceElements'], ['screenshot', 'workspaceScreenshot'],
          ] as const).map(([value, key]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => { setTab(value) }}
            >{t(key)}</button>
          ))}
        </div>
        {error !== null ? <p className={css.error} role="alert">{error}</p> : null}
        {tab === 'steps' ? (
          <ol className={css.steps}>
            {steps.length === 0 ? <li className={css.emptyList}>{t('workspaceNoSteps')}</li> : steps.map((step, index) => (
              <li key={step.id}>
                <span className={css.stepIndex}>{steps.length - index}</span>
                <div>
                  <strong>{t(ACTION_LABELS[step.action] ?? 'workspaceStepOther')}</strong>
                  <span>{step.detail}</span>
                </div>
                <time>{time(step.finishedAt ?? step.startedAt)}</time>
                <span className={css.stepState} data-state={step.status}>
                  {step.status === 'complete'
                    ? <IconCheckOutline14 size={12} />
                    : step.status === 'running'
                      ? <IconLoadingOutline16 size={12} />
                      : <IconWarningOutline16 size={12} />}
                </span>
              </li>
            ))}
          </ol>
        ) : tab === 'elements' ? (
          <pre className={css.elements}>{state?.text || t('workspaceNoElements')}</pre>
        ) : (
          <div className={css.screenshotMeta}>
            <strong>{state?.title ?? t('workspaceNoScreenshot')}</strong>
            <span>{state?.url ?? '—'}</span>
            <span>{state === undefined ? '—' : time(state.updatedAt)}</span>
          </div>
        )}
      </div>
    </aside>
  )
}

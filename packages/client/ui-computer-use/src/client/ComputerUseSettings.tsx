import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  IconChevronDownOutline14, IconRightUpOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComputerUseLocaleKey } from './locales.ts'
import css from './ComputerUseSettings.module.css'

export interface ComputerUsePreferences {
  desktopEnabled: boolean
  browserEnabled: boolean
  defaultBrowserMode: 'isolated' | 'connected'
  connectedBrowserNewTab: boolean
}

export interface ComputerUseStatus {
  desktop: {
    installed: boolean
    accessibility: 'granted' | 'missing' | 'unknown'
    screenRecording: 'granted' | 'missing' | 'unknown'
  }
  isolatedBrowser: { available: boolean }
  connectedBrowser: {
    connected: boolean
    browser?: string
    version?: string
    extensionPath: string
    pairingCode: string
  }
}

export interface ComputerUseSettingsInjected {
  settings: SettingsScope<ComputerUsePreferences>
  status: () => Promise<ComputerUseStatus>
  setupDesktop: () => Promise<void>
  openExtension: () => Promise<void>
}

export type ComputerUseSettingsProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.computerUse'>
  & InjectFace<ComputerUseSettingsInjected>

type RuntimeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; value: ComputerUseStatus }

export function ComputerUseSettings({ settings, status, setupDesktop, openExtension, t }: ComputerUseSettingsProps) {
  const snapshot = useSyncExternalStore(
    listener => settings.subscribe(listener),
    () => settings.getSnapshot(),
    () => settings.getSnapshot(),
  )
  const [runtime, setRuntime] = useState<RuntimeState>({ status: 'loading' })
  const [manageChrome, setManageChrome] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    const refresh = (): void => {
      void status().then(
        (value) => { if (live) setRuntime({ status: 'ready', value }) },
        () => { if (live) setRuntime({ status: 'error' }) },
      )
    }
    refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => { live = false; window.clearInterval(timer) }
  }, [status])

  const preferences = snapshot.value
  const writable = snapshot.writable && preferences !== undefined
  const desktopReady = runtime.status === 'ready'
    && runtime.value.desktop.installed
    && runtime.value.desktop.accessibility === 'granted'
    && runtime.value.desktop.screenRecording === 'granted'
  const chromeConnected = runtime.status === 'ready' && runtime.value.connectedBrowser.connected

  return (
    <div className={css.section}>
      <div className={css.heading}>
        <h2>{t('title')}</h2>
        <p>{t('intro')}</p>
        <span>{desktopReady ? t('permissionReady') : t('permissionMissing')} · {chromeConnected ? t('connected') : t('disconnected')}</span>
      </div>

      {runtime.status === 'loading' ? <p className={css.notice}>{t('loading')}</p> : null}
      {runtime.status === 'error' ? <p className={css.error} role="alert">{t('loadFailed')}</p> : null}

      <section className={css.group} aria-labelledby="computer-use-capabilities">
        <h3 id="computer-use-capabilities">{t('capabilities')}</h3>
        <div className={css.row}>
          <div className={css.rowCopy}>
            <strong>{t('desktopControl')}</strong>
            <span>{t('desktopDescription')}</span>
          </div>
          {!desktopReady ? (
            <button className={css.textButton} type="button" onClick={() => { void setupDesktop() }}>{t('authorize')}</button>
          ) : null}
          <input
            className={css.switch}
            type="checkbox"
            aria-label={t('desktopControl')}
            checked={preferences?.desktopEnabled ?? false}
            disabled={!writable}
            onChange={(event) => { void settings.set('desktopEnabled', event.currentTarget.checked) }}
          />
        </div>
        <div className={css.row}>
          <div className={css.rowCopy}>
            <strong>{t('browserControl')}</strong>
            <span>{t('defaultSourceHint')}</span>
          </div>
          <input
            className={css.switch}
            type="checkbox"
            aria-label={t('browserControl')}
            checked={preferences?.browserEnabled ?? true}
            disabled={!writable}
            onChange={(event) => { void settings.set('browserEnabled', event.currentTarget.checked) }}
          />
        </div>
      </section>

      <section className={css.group} aria-labelledby="computer-use-sources">
        <h3 id="computer-use-sources">{t('browserSource')}</h3>
        <div className={css.sourceRow}>
          <div className={css.rowCopy}>
            <strong>{t('defaultMode')}</strong>
            <span>{t('defaultSourceHint')}</span>
          </div>
          <div className={css.segmented}>
            <button
              type="button"
              data-selected={(preferences?.defaultBrowserMode ?? 'isolated') === 'isolated' ? 'true' : 'false'}
              disabled={!writable}
              onClick={() => { void settings.set('defaultBrowserMode', 'isolated') }}
            >{t('isolatedShort')}</button>
            <button
              type="button"
              data-selected={preferences?.defaultBrowserMode === 'connected' ? 'true' : 'false'}
              disabled={!writable}
              onClick={() => { void settings.set('defaultBrowserMode', 'connected') }}
            >Chrome</button>
          </div>
        </div>
        <button className={css.connectionRow} type="button" aria-expanded={manageChrome} onClick={() => { setManageChrome(value => !value) }}>
          <div className={css.rowCopy}>
            <strong>{t('chromeConnection')}</strong>
            <span>{chromeConnected ? t('connected') : t('disconnected')}</span>
          </div>
          <span className={css.manage}>{t('manageConnection')} <IconChevronDownOutline14 size={12} /></span>
        </button>
        {manageChrome ? (
          <div className={css.connectionPanel}>
            <p>{t('installSteps')}</p>
            <div>
              <button className={css.secondaryButton} type="button" onClick={() => { void openExtension() }}>{t('openFolder')}</button>
              <button
                className={css.primaryButton}
                type="button"
                disabled={runtime.status !== 'ready'}
                onClick={() => {
                  if (runtime.status !== 'ready') return
                  void navigator.clipboard.writeText(runtime.value.connectedBrowser.pairingCode).then(() => {
                    setCopied(true)
                    setTimeout(() => { setCopied(false) }, 1400)
                  })
                }}
              >{copied ? t('copied') : t('copyPairing')} <IconRightUpOutline16 size={12} /></button>
            </div>
          </div>
        ) : null}
        <label className={css.compactRow}>
          <span>{t('newTab')}</span>
          <input
            className={css.switch}
            type="checkbox"
            checked={preferences?.connectedBrowserNewTab ?? true}
            disabled={!writable}
            onChange={(event) => { void settings.set('connectedBrowserNewTab', event.currentTarget.checked) }}
          />
        </label>
      </section>
    </div>
  )
}

export type { ComputerUseLocaleKey }

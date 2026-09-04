import { useEffect, useId, useRef, useState } from 'react'
import { SettingsSectionHeader } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MemoryDocumentKind, MemoryDocumentView } from '../types.ts'
import {
  loadMemoryDocuments,
  organizeAiMemory,
  restoreMemoryDocument,
  saveMemoryDocument,
  type MemoryDocumentsResponse,
} from './api.ts'
import type { MemoryLocaleKey } from './locales.ts'
import css from './MemorySettings.module.css'

type Translate = (key: MemoryLocaleKey, params?: Record<string, unknown>) => string

export interface MemorySettingsProps { readonly t: Translate }

function displayTime(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function replaceDocument(
  snapshot: MemoryDocumentsResponse,
  kind: MemoryDocumentKind,
  document: MemoryDocumentView,
): MemoryDocumentsResponse {
  return { ...snapshot, [kind]: document }
}

/** Compact editor for both global living-memory documents. */
export function MemorySettings({ t }: MemorySettingsProps) {
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [snapshot, setSnapshot] = useState<MemoryDocumentsResponse>()
  const [drafts, setDrafts] = useState<Record<MemoryDocumentKind, string>>({ user: '', ai: '' })
  const [active, setActive] = useState<MemoryDocumentKind>('user')
  const [busy, setBusy] = useState<'save' | 'restore' | 'organize'>()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const load = async (signal?: AbortSignal): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const loaded = await loadMemoryDocuments(signal)
      setSnapshot(loaded)
      setDrafts({ user: loaded.user.content, ai: loaded.ai.content })
    } catch (reason) {
      if (signal?.aborted !== true) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (signal?.aborted !== true) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [])

  const document = snapshot?.[active]
  const dirty = document !== undefined && drafts[active] !== document.content
  const updateDocument = (next: MemoryDocumentView, message: string): void => {
    setSnapshot(current => current === undefined ? current : replaceDocument(current, active, next))
    setDrafts(current => ({ ...current, [active]: next.content }))
    setStatus(message)
  }
  const save = async (): Promise<void> => {
    if (document === undefined || !dirty || busy !== undefined) return
    setBusy('save'); setError(''); setStatus('')
    try {
      updateDocument(await saveMemoryDocument(active, drafts[active], document.revision), t('saved'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(undefined) }
  }
  const restore = async (): Promise<void> => {
    if (document === undefined || !document.canRestore || busy !== undefined) return
    setBusy('restore'); setError(''); setStatus('')
    try {
      updateDocument(await restoreMemoryDocument(active, document.revision), t('restored'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(undefined) }
  }

  const organize = async (): Promise<void> => {
    if (snapshot === undefined || busy !== undefined) return
    setBusy('organize'); setError(''); setStatus('')
    try {
      const outcome = await organizeAiMemory()
      switch (outcome.status) {
        case 'completed':
          setStatus(outcome.changed === true ? t('organized') : t('organizedUnchanged'))
          // An unsaved local draft must keep its own revision story; a clean
          // editor can safely adopt what this pass committed.
          if (!dirty) await load()
          break
        case 'empty':
          setStatus(t('organizedUnchanged'))
          break
        case 'busy':
          setStatus(t('organizeBusy'))
          break
        case 'failed':
          setError(t('organizeFailed', { message: outcome.message ?? '' }))
          break
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(undefined) }
  }

  const updated = displayTime(
    active === 'ai'
      ? snapshot?.state.lastMaintenanceAt ?? document?.updatedAt
      : document?.updatedAt,
  )
  return (
    <div className={css.root}>
      <SettingsSectionHeader title={t('title')} />
      <div className={css.tabs} role="tablist" aria-label={t('title')}>
        {(['user', 'ai'] as const).map((kind, index, kinds) => (
          <button
            key={kind}
            ref={(element) => { tabRefs.current[index] = element }}
            id={`${tabsId}-tab-${kind}`}
            type="button"
            role="tab"
            aria-selected={active === kind}
            aria-controls={`${tabsId}-panel-${kind}`}
            tabIndex={active === kind ? 0 : -1}
            className={css.tab}
            data-active={active === kind ? 'true' : undefined}
            onClick={() => { setActive(kind); setStatus(''); setError('') }}
            onKeyDown={(event) => {
              let nextIndex: number
              switch (event.key) {
                case 'ArrowRight': nextIndex = (index + 1) % kinds.length; break
                case 'ArrowLeft': nextIndex = (index - 1 + kinds.length) % kinds.length; break
                case 'Home': nextIndex = 0; break
                case 'End': nextIndex = kinds.length - 1; break
                default: return
              }
              event.preventDefault()
              setActive(kinds[nextIndex] as MemoryDocumentKind)
              setStatus(''); setError('')
              tabRefs.current[nextIndex]?.focus()
            }}
          >
            {t(`tab.${kind}`)}
          </button>
        ))}
      </div>
      {snapshot === undefined && loading ? <p className={css.notice}>{t('loading')}</p> : null}
      {snapshot === undefined && !loading && error !== '' ? (
        <div className={css.notice}>
          <span className={css.error} role="alert">{error}</span>
          {' '}
          <button type="button" className={css.secondary} onClick={() => { void load() }}>{t('retry')}</button>
        </div>
      ) : null}
      {document !== undefined ? (
        <section
          id={`${tabsId}-panel-${active}`}
          className={css.editorPanel}
          role="tabpanel"
          aria-labelledby={`${tabsId}-tab-${active}`}
        >
          <textarea
            className={css.editor}
            aria-label={t(`editor.${active}`)}
            value={drafts[active]}
            placeholder={t('empty')}
            spellCheck={false}
            onChange={(event) => {
              const value = event.currentTarget.value
              setDrafts(current => ({ ...current, [active]: value }))
              setStatus('')
            }}
          />
          <div className={css.footer}>
            <div className={css.meta}>
              {updated === undefined ? null : <span>{t('updatedAt', { time: updated })}</span>}
              {active !== 'ai' || snapshot?.state.lastMaintenanceError === undefined ? null : (
                <span className={css.error} role="alert">
                  {t('lastFailed', {
                    time: displayTime(snapshot.state.lastMaintenanceError.at)
                      ?? snapshot.state.lastMaintenanceError.at,
                    message: snapshot.state.lastMaintenanceError.message,
                  })}
                </span>
              )}
              {status === '' ? null : <span className={css.success} role="status">{status}</span>}
              {error === '' ? null : <span className={css.error} role="alert">{error}</span>}
            </div>
            <div className={css.actions}>
              {active === 'ai' ? (
                <button type="button" className={css.secondary} disabled={busy !== undefined} onClick={() => { void organize() }}>
                  {busy === 'organize' ? t('organizing') : t('organize')}
                </button>
              ) : null}
              {document.canRestore ? (
                <button type="button" className={css.secondary} disabled={busy !== undefined} onClick={() => { void restore() }}>
                  {busy === 'restore' ? t('restoring') : t('restore')}
                </button>
              ) : null}
              <button type="button" className={css.primary} disabled={!dirty || busy !== undefined} onClick={() => { void save() }}>
                {busy === 'save' ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {snapshot !== undefined && error !== '' ? <p className={css.error} role="alert">{error}</p> : null}
    </div>
  )
}

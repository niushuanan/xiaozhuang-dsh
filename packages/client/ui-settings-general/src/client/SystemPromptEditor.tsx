/** User-editable product System Prompt at the bottom of General Settings. */

import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsKey } from './locales.ts'
import { SystemPromptRequestError, type SystemPromptDocument } from './system-prompt.ts'
import css from './SystemPromptEditor.module.css'

export interface SystemPromptEditorInjected {
  load: (signal?: AbortSignal) => Promise<SystemPromptDocument>
  save: (document: Pick<SystemPromptDocument, 'revision'> & { content: string }) => Promise<SystemPromptDocument>
}

export type SystemPromptEditorProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>
  & InjectFace<SystemPromptEditorInjected>

type EditorStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error' | 'conflict'

/** Render the current base prompt and persist edits to the global SYSTEM.md. */
export function SystemPromptEditor({ load, save, t }: SystemPromptEditorProps) {
  const [document, setDocument] = useState<SystemPromptDocument | null>(null)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<EditorStatus>('idle')
  const [reload, setReload] = useState(0)
  const dirty = document !== null && draft !== document.content
  const dirtyRef = useRef(dirty)
  const statusRef = useRef(status)
  dirtyRef.current = dirty
  statusRef.current = status

  useEffect(() => {
    const controller = new AbortController()
    setStatus(current => current === 'idle' ? 'loading' : current)
    void load(controller.signal).then(
      (next) => {
        if (dirtyRef.current) return
        setDocument(next)
        setDraft(next.content)
        setStatus('ready')
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('[settings system prompt] load failed:', error)
        setStatus('error')
      },
    )
    return () => { controller.abort() }
  }, [load, reload])

  useEffect(() => {
    const refresh = (): void => {
      if (globalThis.document.visibilityState !== 'visible' || dirtyRef.current
        || statusRef.current === 'loading' || statusRef.current === 'saving') return
      setReload(value => value + 1)
    }
    window.addEventListener('focus', refresh)
    globalThis.document.addEventListener('visibilitychange', refresh)
    const interval = window.setInterval(refresh, 5_000)
    return () => {
      window.removeEventListener('focus', refresh)
      globalThis.document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(interval)
    }
  }, [])

  const persist = async (): Promise<void> => {
    if (document === null || !dirty || status === 'saving' || status === 'conflict') return
    const submittedDraft = draft
    setStatus('saving')
    try {
      const saved = await save({ content: submittedDraft, revision: document.revision })
      setDocument(saved)
      setDraft(current => current === submittedDraft ? saved.content : current)
      setStatus('ready')
    } catch (error) {
      console.warn('[settings system prompt] save failed:', error)
      setStatus(error instanceof SystemPromptRequestError && error.status === 409 ? 'conflict' : 'error')
    }
  }

  const loadLatest = (): void => {
    setDocument(null)
    setDraft('')
    setStatus('loading')
    setReload(value => value + 1)
  }

  const text = (key: SettingsKey): string => t(key)

  return (
    <section className={css.section} aria-labelledby="settings-system-prompt-title">
      <div className={css.heading}>
        <div>
          <h3 id="settings-system-prompt-title">{text('systemPrompt.title')}</h3>
          <p>{text('systemPrompt.description')}</p>
        </div>
        <code>{document?.displayPath ?? '~/.dsh/SYSTEM.md'}</code>
      </div>

      <div className={css.surface}>
        {status === 'loading' ? <p className={css.notice}>{text('systemPrompt.loading')}</p> : null}
        {status === 'error' ? (
          <p className={css.error} role="alert">
            {text('systemPrompt.error')}
            <button type="button" className={css.textButton} onClick={loadLatest}>{text('systemPrompt.retry')}</button>
          </p>
        ) : null}
        {status === 'conflict' ? (
          <p className={css.error} role="alert">
            {text('systemPrompt.conflict')}
            <button type="button" className={css.textButton} onClick={loadLatest}>{text('systemPrompt.loadLatest')}</button>
          </p>
        ) : null}
        {document !== null ? (
          <>
            <textarea
              className={css.editor}
              aria-label={text('systemPrompt.editorLabel')}
              value={draft}
              spellCheck={false}
              placeholder={text('systemPrompt.placeholder')}
              onChange={(event) => {
                setDraft(event.currentTarget.value)
                if (status === 'error') setStatus('ready')
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                  event.preventDefault()
                  void persist()
                }
              }}
            />
            <div className={css.footer}>
              <span aria-live="polite">
                {status === 'saving'
                  ? text('systemPrompt.saving')
                  : dirty ? text('systemPrompt.unsaved') : text('systemPrompt.saved')}
              </span>
              <button
                type="button"
                className={css.primaryButton}
                disabled={!dirty || status === 'saving' || status === 'conflict'}
                onClick={() => { void persist() }}
              >{text('systemPrompt.save')}</button>
            </div>
          </>
        ) : null}
      </div>
      <p className={css.priority}>{text('systemPrompt.priority')}</p>
    </section>
  )
}

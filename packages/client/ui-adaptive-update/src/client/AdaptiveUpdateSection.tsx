/** Native Settings page for long-running review-first update operations. */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { IdleUpdateView, UpdateSnapshot } from '../types.ts'
import css from './AdaptiveUpdateSection.module.css'

const API = '/plugins/ui-adaptive-update/api'
type View = IdleUpdateView | UpdateSnapshot

const PHASE_LABEL: Record<string, string> = {
  idle: '尚未开始',
  discovering: '正在确认官方版本',
  reviewing: '正在深度审查',
  adapting: '正在独立候选区适配',
  validating: '正在验证候选版本',
  'waiting-for-idle': '验证通过，等待当前对话空闲',
  applying: '正在安全切换',
  completed: '更新已完成',
  failed: '本次更新未应用',
  'rolled-back': '已回到更新前版本',
}

function shortCommit(commit: string | undefined): string {
  return commit?.slice(0, 12) ?? '—'
}

async function request(path: string, method = 'GET'): Promise<View> {
  const response = await fetch(`${API}/${path}`, { method })
  const value = await response.json() as View | { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof (value as { error?: unknown }).error === 'string'
      ? (value as { error: string }).error
      : '请求失败')
  }
  return value as View
}

/** Settings section rendered through the native settings slot. */
export function AdaptiveUpdateSection(_props: PropsRuntime<'settings.section'>): ReactNode {
  const [view, setView] = useState<View>({ phase: 'idle' })
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    try { setView(await request('state')); setError(undefined) } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 2_000)
    return () => { window.clearInterval(timer) }
  }, [refresh])

  const active = !['idle', 'completed', 'failed', 'rolled-back'].includes(view.phase)
  const snapshot = view.phase === 'idle' ? undefined : view
  const start = async () => {
    setError(undefined)
    try { setView(await request('start', 'POST')) } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section className={css.root} aria-labelledby="adaptive-update-title">
      <header className={css.header}>
        <h2 id="adaptive-update-title">自适应更新</h2>
        <span className={css.phase} data-phase={view.phase}>{PHASE_LABEL[view.phase] ?? view.phase}</span>
      </header>

      <div className={css.commits}>
        <div><span>当前版本</span><code>{shortCommit(view.currentCommit)}</code></div>
        <div><span>官方版本</span><code>{shortCommit(snapshot?.upstreamCommit)}</code></div>
      </div>

      {snapshot?.report !== undefined && (
        <div className={css.review}>
          <div className={css.metrics}>
            <span>重叠文件 <strong>{snapshot.report.overlappingFiles.length}</strong></span>
            <span>合并冲突 <strong>{snapshot.report.conflictFiles.length}</strong></span>
            <span>影响插件 <strong>{snapshot.report.impactedPlugins.length}</strong></span>
          </div>
          {snapshot.report.review !== '' && <pre>{snapshot.report.review}</pre>}
        </div>
      )}

      {snapshot?.checks.length !== undefined && snapshot.checks.length > 0 && (
        <ul className={css.checks}>
          {snapshot.checks.map(check => (
            <li key={check.id} data-status={check.status}>
              <span aria-hidden="true" className={css.dot} />
              <span>{check.label}</span>
            </li>
          ))}
        </ul>
      )}

      {active && <p className={css.notice}>审查和适配在后台进行，当前版本可继续使用。只会在对话空闲且验证全部通过后切换。</p>}
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      {snapshot?.error !== undefined && <p className={css.error} role="alert">{snapshot.error}</p>}

      <div className={css.actions}>
        <button type="button" disabled={active} onClick={() => { void start() }}>
          {active ? '正在处理' : '开始自适应更新'}
        </button>
      </div>
    </section>
  )
}

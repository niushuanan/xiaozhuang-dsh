/** Native Settings page for manual and automatic continuous adaptation. */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AutomaticUpdateView, IdleUpdateView, UpdateSnapshot } from '../types.ts'
import css from './AdaptiveUpdateSection.module.css'

const API = '/plugins/ui-adaptive-update/api'
type View = IdleUpdateView | UpdateSnapshot

const PHASE_LABEL: Record<string, string> = {
  idle: '尚未开始',
  discovering: '正在确认官方版本',
  reviewing: '正在检查合并冲突',
  adapting: '正在处理兼容冲突',
  validating: '正在确认候选可构建',
  'waiting-for-idle': '候选可用，等待当前对话空闲',
  applying: '正在安全切换',
  completed: '更新已完成',
  failed: '本次更新未应用',
  'rolled-back': '已回到更新前版本',
}

function shortCommit(commit: string | undefined): string {
  return commit?.slice(0, 12) ?? '—'
}

async function request<T>(path: string, method = 'GET'): Promise<T> {
  const response = await fetch(`${API}/${path}`, { method })
  const value = await response.json() as T | { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof (value as { error?: unknown }).error === 'string'
      ? (value as { error: string }).error
      : '请求失败')
  }
  return value as T
}

/** Settings section rendered through the native settings slot. */
export function AdaptiveUpdateSection(_props: PropsRuntime<'settings.section'>): ReactNode {
  const [view, setView] = useState<View>({ phase: 'idle' })
  const [automatic, setAutomatic] = useState<AutomaticUpdateView>({
    enabled: false,
    checking: false,
    intervalHours: 6,
  })
  const [savingAutomatic, setSavingAutomatic] = useState(false)
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    try {
      const [nextView, nextAutomatic] = await Promise.all([
        request<View>('state'),
        request<AutomaticUpdateView>('automatic'),
      ])
      setView(nextView)
      setAutomatic(nextAutomatic)
      setError(undefined)
    } catch (cause) {
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
  const displayedCommit = view.phase === 'completed'
    ? view.candidateCommit ?? view.currentCommit
    : view.currentCommit
  let automaticStatus = '已关闭'
  if (savingAutomatic) automaticStatus = '保存中'
  else if (automatic.checking) automaticStatus = '检查中'
  else if (automatic.enabled) automaticStatus = '已开启'
  const start = async () => {
    setError(undefined)
    try { setView(await request<View>('start', 'POST')) } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const toggleAutomatic = async () => {
    setSavingAutomatic(true)
    setError(undefined)
    try {
      setAutomatic(await request<AutomaticUpdateView>(
        automatic.enabled ? 'automatic/disable' : 'automatic/enable',
        'POST',
      ))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSavingAutomatic(false)
    }
  }

  return (
    <section className={css.root} aria-labelledby="adaptive-update-title">
      <header className={css.header}>
        <h2 id="adaptive-update-title">持续适配</h2>
        <span className={css.phase} data-phase={view.phase}>{PHASE_LABEL[view.phase] ?? view.phase}</span>
      </header>

      <div className={css.automatic}>
        <button
          type="button"
          role="switch"
          aria-checked={automatic.enabled}
          className={css.automaticCapsule}
          disabled={savingAutomatic}
          onClick={() => { void toggleAutomatic() }}
        >
          <span aria-hidden="true" className={css.automaticDot} />
          <span>自动更新 · 每 {automatic.intervalHours} 小时</span>
          <strong>{automaticStatus}</strong>
        </button>
      </div>

      <div className={css.commits}>
        <div><span>当前版本</span><code>{shortCommit(displayedCommit)}</code></div>
        <div><span>官方版本</span><code>{shortCommit(snapshot?.upstreamCommit)}</code></div>
      </div>

      {snapshot?.report !== undefined && (
        <div className={css.review}>
          <div className={css.metrics}>
            <span>重叠文件 <strong>{snapshot.report.overlappingFiles.length}</strong></span>
            <span>合并冲突 <strong>{snapshot.report.conflictFiles.length}</strong></span>
            <span>影响插件 <strong>{snapshot.report.impactedPlugins.length}</strong></span>
          </div>
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

      {active && <p className={css.notice}>冲突处理在后台进行，当前版本可继续使用。只会在对话空闲且新版本可启动后切换。</p>}
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
      {automatic.enabled && automatic.lastError !== undefined && (
        <p className={css.error} role="alert">自动检查：{automatic.lastError}</p>
      )}
      {snapshot?.error !== undefined && <p className={css.error} role="alert">{snapshot.error}</p>}

      <div className={css.actions}>
        <button type="button" disabled={active} onClick={() => { void start() }}>
          {active ? '正在处理' : '立即检查并适配'}
        </button>
      </div>
    </section>
  )
}

/**
 * AgentTerminalView: the READ-ONLY mirror of one official model terminal
 * (`ctx.terminals`, created by the model's `terminal_*` tools). It does NOT
 * reuse TerminalView's xterm + WebSocket pipeline — that pipeline is
 * interactive (it writes keystrokes straight to the pty), and the model owns
 * the interactive send seam exclusively: a user keystroke could race a
 * `terminal_send` and hit the service's SEND_ACTIVE refusal, or worse, inject
 * into a shell the model is driving.
 *
 * Instead this is a plain scrolling `<pre>` that polls `agent-terminal.read`
 * (the tail page) once per second, gated on `visible` (active tab + open
 * panel), plus a status line (`running` / `exited (code N)`) and a close
 * button that releases the terminal through `agent-terminal.close` (fired by
 * the tab descriptor's `onClose`, so the tab-bar close converges the same
 * way). The bottom row is a read-only hint — there is deliberately no input.
 */
import { useEffect, useRef, useState } from 'react'
import type { Context } from '../context-types.ts'
import type { SidebarStore } from './state.ts'
import { agentTerminalIdOf } from './state.ts'
import { api, type SessionScope } from './api.ts'
import { t } from './locales.ts'
import css from './sidebar.module.css'

/** Poll interval (ms): the task's 1s tail-refresh cadence. */
const POLL_INTERVAL_MS = 1000

/** The tail-page size requested from `agent-terminal.read` each poll. */
const READ_COUNT = 500

export interface AgentTerminalViewProps {
  ctx: Context
  store: SidebarStore
  scope: SessionScope
  tab: { id: string; title: string }
  /** Whether the tab is active AND the panel is open (live views pause otherwise). */
  visible: boolean
}

export function AgentTerminalView(props: AgentTerminalViewProps) {
  const { ctx, scope, tab, visible } = props
  const terminalId = agentTerminalIdOf(tab.id)
  const [text, setText] = useState('')
  const [exited, setExited] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [exitSignal, setExitSignal] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  // Poll the tail only while the tab is visible (active + panel open). A
  // `visible=false` effect tears the timer down; re-activation re-reads.
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let timer: number | undefined
    const poll = async (): Promise<void> => {
      try {
        const result = await api.agentTerminalRead(scope, terminalId, 0, READ_COUNT)
        if (cancelled) return
        setText(result.text)
        setExited(result.exited)
        setExitCode(result.exited ? result.exitCode ?? null : null)
        setExitSignal(result.exited ? result.exitSignal ?? null : null)
        setError(null)
      } catch (readError) {
        if (cancelled) return
        setError(readError instanceof Error ? readError.message : String(readError))
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => { void poll() }, POLL_INTERVAL_MS)
        }
      }
    }
    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [visible, scope.sessionId, scope.cwd, terminalId])

  // Keep the newest output in view (the tail is the live edge).
  useEffect(() => {
    const el = outputRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [text])

  const close = (): void => {
    ctx.get('betterSidebar')?.closeTab(tab.id, scope)
  }

  const statusLabel = exited
    ? exitSignal !== null
      ? `${t('agentTerminalExited')} (${t('agentTerminalSignal')} ${exitSignal})`
      : exitCode !== null
        ? `${t('agentTerminalExited')} (${exitCode})`
        : t('agentTerminalExited')
    : t('agentTerminalRunning')

  return (
    <div className={css.terminalWrap}>
      <div className={css.agentTerminalStatus}>
        <span className={exited ? css.agentTerminalStatusExited : css.agentTerminalStatusRunning}>{statusLabel}</span>
        <button type="button" className={css.terminalRetry} onClick={close}>{t('close')}</button>
      </div>
      {error !== null && <div className={css.terminalBanner}>{error}</div>}
      <pre ref={outputRef} className={css.agentTerminalOutput}>{text}</pre>
      <div className={css.agentTerminalReadonly}>{t('agentTerminalReadonly')}</div>
    </div>
  )
}

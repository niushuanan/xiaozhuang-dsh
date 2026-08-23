import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge (the top-level action seats).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PlanModeStatusInjected } from './index.ts'
import css from './PlanModeControl.module.css'

/** Full top-level plan-status props for the blank Hero or active header. */
export type PlanModeStatusProps =
  (PropsRuntime<'conversation.session.header.actions'> | PropsRuntime<'conversation.hero.actions'>)
  & InjectFace<PlanModeStatusInjected>
  & PropsLocale<'plan'>

/**
 * Plan-mode status over the host-computed `plan` projection. The action renders
 * only while the effective target is plan mode (`pending ? !active : active`
 * — a folded host value, not client optimism) and executes /plan off.
 */
export function PlanModeStatus({ useProjection, exitPlanMode, t }: PlanModeStatusProps) {
  const plan = useProjection('plan')
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  if (plan === undefined) return null
  const target = plan.pending ? !plan.active : plan.active
  if (!target) return null

  const off = (): void => {
    // The leaving state disables the button, so no duplicate click arrives.
    setLeaving(true)
    setError(null)
    void exitPlanMode().then((failure) => {
      if (!aliveRef.current) return
      setLeaving(false)
      setError(failure)
    }, (reason: unknown) => {
      if (!aliveRef.current) return
      setLeaving(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <span className={css.root}>
      <button
        type="button"
        className={css.button}
        aria-label={t('status.on.aria')}
        title={error ?? t('status.on.title')}
        disabled={leaving}
        onClick={off}
      >
        <span>{t('status.on.label')}</span>
        <span className={css.close} aria-hidden>
          <IconCloseFill14 size={12} />
        </span>
      </button>
      {/* Failure copy stays English (error-surface policy: not localized). */}
      {error !== null && <span className={css.visuallyHidden} role="status">{error}</span>}
    </span>
  )
}

/**
 * Settings shell root: the sidebar-foot trigger row plus the centered modal
 * panel (figma 501:29947, 1080x700) with the section nav rail. The shell is
 * a pure composition face — every piece of text (trigger label, panel title,
 * close label, sections) arrives from registrants through slots; accessible
 * names resolve to that content (trigger: its own text; dialog:
 * aria-labelledby the title node; close: visually-hidden slot text). Modal
 * open state and the active section id are component-local viewing state;
 * the onboarding coordinator mounts exactly one ordered registrant while the
 * sessions-derived empty-Hero fact is active. Visible dialog chrome belongs
 * to the step, so a mounted-but-deciding step paints nothing here.
 */
import {
  type PointerEvent as ReactPointerEvent,
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react'
import clsx from 'clsx'
import {
  FishLogo, IconAdaptiveUpdateOutline16, IconAgentPresetOutline16, IconCloseOutline16,
  IconDataOutline16, IconMemoryOutline16, IconPanelLeftOutline16,
  IconPersonalizationOutline16, IconSettingsOutline16, IconSkillOutline16,
  IconSparkle16, IconTeamworkOutline16, IconUsageTrendOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsRootComponentProps, SettingsSectionRow } from './shell-contract.ts'
import css from './SettingsRoot.module.css'

/** Nav glyph by section id; unknown ids fall back to the settings gear. */
function navIcon(id: string) {
  if (id === 'better-sidebar') return <IconPanelLeftOutline16 className={css.navIcon} size={16} />
  if (id === 'product-companion') return <FishLogo className={css.navIcon} size={19} />
  if (id === 'models') return <IconDataOutline16 className={css.navIcon} size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutline16 className={css.navIcon} size={16} />
  if (id === 'plugins') return <IconPersonalizationOutline16 className={css.navIcon} size={16} />
  if (id === 'teamwork-settings') return <IconTeamworkOutline16 className={css.navIcon} size={16} />
  if (id === 'token-overview') return <IconUsageTrendOutline16 className={css.navIcon} size={16} />
  if (id === 'xiaozhuang-plugins') return <IconSparkle16 className={css.navIcon} size={16} />
  if (id === 'memory-system') return <IconMemoryOutline16 className={css.navIcon} size={16} />
  if (id === 'adaptive-update') return <IconAdaptiveUpdateOutline16 className={css.navIcon} size={16} />
  if (id === 'skill') return <IconSkillOutline16 className={css.navIcon} size={16} />
  return <IconSettingsOutline16 className={css.navIcon} size={16} />
}

type PanelProps = {
  rows: readonly SettingsSectionRow[]
  renderSlot: SettingsRootComponentProps['renderSlot']
  activeId: string | undefined
  onSelect: (id: string) => void
  onLabelChange: (id: string, label: string) => void
  onOrderChange: (order: string[]) => void
  onClose: () => void
}

const NAV_HOLD_MS = 1_000
const NAV_HOLD_MOVE_TOLERANCE = 6

type PendingHold = {
  id: string
  pointerId: number
  startX: number
  startY: number
  timer: number
}

type NavigationDrag = {
  id: string
  pointerId: number
  targetIndex: number
}

type PointerCaptureTarget = {
  setPointerCapture?: (pointerId: number) => void
  releasePointerCapture?: (pointerId: number) => void
}

function arrangeRows(rows: readonly SettingsSectionRow[], order: readonly string[]): readonly SettingsSectionRow[] {
  if (order.length === 0) return rows
  const byId = new Map(rows.map(row => [row.id, row]))
  const arranged = order.flatMap((id) => {
    const row = byId.get(id)
    if (row === undefined) return []
    byId.delete(id)
    return [row]
  })
  for (const row of rows) {
    if (byId.delete(row.id)) arranged.push(row)
  }
  return arranged
}

function moveRow(rows: readonly SettingsSectionRow[], id: string, targetIndex: number): readonly SettingsSectionRow[] {
  const row = rows.find(candidate => candidate.id === id)
  if (row === undefined) return rows
  const remaining = rows.filter(candidate => candidate.id !== id)
  const bounded = Math.max(0, Math.min(targetIndex, remaining.length))
  return [...remaining.slice(0, bounded), row, ...remaining.slice(bounded)]
}

/**
 * The modal layer: full-viewport mask + centered panel. Close paths: the
 * header button, a mask click, and document-level Escape (mounted only while
 * open, so the listener lifetime is the panel's).
 */
function SettingsPanel({ rows, renderSlot, activeId, onSelect, onLabelChange, onOrderChange, onClose }: PanelProps) {
  // Entries can unmount underneath the requested id, so the render-time
  // projection falls back to the first row when the id is gone.
  const active = rows.find(r => r.id === activeId)?.id ?? rows[0]?.id
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  // Baseline focus management: entering the dialog lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  const navCells = useRef(new Map<string, HTMLButtonElement>())
  const pendingHold = useRef<PendingHold | null>(null)
  const suppressedClick = useRef<string | null>(null)
  const [drag, setDrag] = useState<NavigationDrag | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])
  useEffect(() => () => {
    if (pendingHold.current !== null) window.clearTimeout(pendingHold.current.timer)
  }, [])
  const setActiveLabel = useCallback((label: string) => {
    if (active !== undefined) onLabelChange(active, label)
  }, [active, onLabelChange])
  const cancelHold = useCallback(() => {
    if (pendingHold.current === null) return
    window.clearTimeout(pendingHold.current.timer)
    pendingHold.current = null
  }, [])
  const cancelDrag = useCallback(() => {
    cancelHold()
    setDrag(null)
  }, [cancelHold])
  const targetIndexAt = useCallback((id: string, clientY: number) => {
    const remaining = rows.filter(row => row.id !== id)
    const index = remaining.findIndex((row) => {
      const rect = navCells.current.get(row.id)?.getBoundingClientRect()
      return rect !== undefined && clientY < rect.top + rect.height / 2
    })
    return index === -1 ? remaining.length : index
  }, [rows])
  const startHold = useCallback((event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return
    cancelHold()
    const target = event.currentTarget as PointerCaptureTarget
    target.setPointerCapture?.(event.pointerId)
    const pointerId = event.pointerId
    const timer = window.setTimeout(() => {
      const pending = pendingHold.current
      if (pending === null || pending.pointerId !== pointerId || pending.id !== id) return
      pendingHold.current = null
      suppressedClick.current = id
      setDrag({ id, pointerId, targetIndex: targetIndexAt(id, pending.startY) })
    }, NAV_HOLD_MS)
    pendingHold.current = {
      id,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    }
  }, [cancelHold, targetIndexAt])
  const movePointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingHold.current
    if (pending !== null && pending.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > NAV_HOLD_MOVE_TOLERANCE) {
        window.clearTimeout(pending.timer)
        pendingHold.current = null
        suppressedClick.current = pending.id
        event.preventDefault()
        setDrag({ id: pending.id, pointerId: pending.pointerId, targetIndex: targetIndexAt(pending.id, event.clientY) })
      }
      return
    }
    if (drag === null || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const targetIndex = targetIndexAt(drag.id, event.clientY)
    setDrag(previous => previous === null || previous.targetIndex === targetIndex
      ? previous
      : { ...previous, targetIndex })
  }, [drag, targetIndexAt])
  const finishPointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    cancelHold()
    if (drag !== null && drag.pointerId === event.pointerId) {
      onOrderChange(moveRow(rows, drag.id, drag.targetIndex).map(row => row.id))
      setDrag(null)
      window.setTimeout(() => { suppressedClick.current = null }, 0)
    }
    const target = event.currentTarget as PointerCaptureTarget
    target.releasePointerCapture?.(event.pointerId)
  }, [cancelHold, drag, onOrderChange, rows])
  const remainingRows = drag === null ? [] : rows.filter(row => row.id !== drag.id)
  const indicatorBefore = drag === null || drag.targetIndex >= remainingRows.length
    ? undefined
    : remainingRows[drag.targetIndex]?.id
  const indicatorAfter = drag === null || drag.targetIndex < remainingRows.length
    ? undefined
    : remainingRows.at(-1)?.id

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <nav className={css.nav}>
          <div className={css.navTitle} id={titleId}>{renderSlot('settings.header', {})}</div>
          <div className={css.navList}>
            {rows.map(row => (
              <div
                key={row.id}
                className={clsx(css.navRow, row.id === drag?.id && css.dragging)}
              >
                {indicatorBefore === row.id && (
                  <span className={clsx(css.dropIndicator, css.before)} data-settings-drop-indicator="true" />
                )}
                <button
                  ref={(node) => {
                    if (node === null) navCells.current.delete(row.id)
                    else navCells.current.set(row.id, node)
                  }}
                  type="button"
                  className={clsx(css.navCell, row.id === active && css.active)}
                  aria-current={row.id === active ? 'true' : undefined}
                  onPointerDown={(event) => { startHold(event, row.id) }}
                  onPointerMove={movePointer}
                  onPointerUp={finishPointer}
                  onPointerCancel={cancelDrag}
                  onClick={(event) => {
                    if (suppressedClick.current === row.id) {
                      event.preventDefault()
                      suppressedClick.current = null
                      return
                    }
                    onSelect(row.id)
                  }}
                >
                  {navIcon(row.id)}
                  <span className={css.navLabel}>{row.label}</span>
                </button>
                {indicatorAfter === row.id && (
                  <span className={clsx(css.dropIndicator, css.after)} data-settings-drop-indicator="true" />
                )}
              </div>
            ))}
          </div>
        </nav>
        <div className={css.content}>
          <div className={css.header}>
            <div className={css.actions}>{renderSlot('settings.action', {})}</div>
            <button ref={closeButton} type="button" className={css.close} onClick={onClose}>
              <IconCloseOutline16 size={14} />
              <span className={css.hiddenLabel}>{renderSlot('settings.close', {})}</span>
            </button>
          </div>
          <div className={css.options}>
            {active !== undefined && renderSlot('settings.section', {
              close: onClose,
              setLabel: setActiveLabel,
            }, { only: active })}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Render the settings trigger and panel.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the settings shell element tree.
 */
export function SettingsRoot(props: SettingsRootComponentProps) {
  const { wide, useSections, useOnboardingSteps, useSessions, useStore, actions, renderSlot } = props
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [sectionLabelOverrides, setSectionLabelOverrides] = useState<Readonly<Record<string, string>>>({})
  const [completedOnboarding, setCompletedOnboarding] = useState<ReadonlySet<string>>(() => new Set())
  const close = useCallback(() => {
    setOpen(false)
    setActiveId(undefined)
  }, [])
  const openSection = useCallback((id: string) => {
    setActiveId(id)
    setOpen(true)
  }, [])

  // The ledger tick keeps the nav rows fresh: registrants re-register with
  // freshly localized text on locale change, and the trigger/header/close
  // seats re-render through their own outlets' subscriptions.
  const rows = useSections(s => s)
  const sectionOrder = useStore(state => state.order)
  const visibleRows = useMemo(() => arrangeRows(rows.map(row => ({
    ...row,
    label: sectionLabelOverrides[row.id] ?? row.label,
  })), sectionOrder), [rows, sectionLabelOverrides, sectionOrder])
  const setSectionLabel = useCallback((id: string, label: string) => {
    setSectionLabelOverrides(previous => previous[id] === label
      ? previous
      : { ...previous, [id]: label })
  }, [])
  const onboardingSteps = useOnboardingSteps(s => s)
  const onboardingActive = useSessions(state =>
    state.phase === 'ready'
    && (state.current === undefined || state.byId[state.current]?.blank === true))
  const onboardingStep = onboardingActive
    ? onboardingSteps.find(step => !completedOnboarding.has(step.id))
    : undefined

  useEffect(() => {
    if (onboardingActive) return
    setCompletedOnboarding(new Set())
  }, [onboardingActive])

  const completeOnboardingStep = useCallback((id: string) => {
    setCompletedOnboarding((previous) => {
      if (previous.has(id)) return previous
      return new Set([...previous, id])
    })
  }, [])

  return (
    <>
      <button
        type="button"
        className={clsx(css.trigger, !wide && css.rail)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(true) }}
      >
        {renderSlot('settings.trigger', { wide })}
      </button>
      {open && (
        <SettingsPanel
          rows={visibleRows}
          renderSlot={renderSlot}
          activeId={activeId}
          onSelect={setActiveId}
          onLabelChange={setSectionLabel}
          onOrderChange={actions.setOrder}
          onClose={close}
        />
      )}
      {/* Dialog chrome and `#root` inert ownership live inside each step's
          visible branch. A step still deciding (private facts loading)
          renders null, so nothing paints or blocks while it decides. */}
      {onboardingStep !== undefined && renderSlot('settings.onboarding', {
        stepId: onboardingStep.id,
        complete: () => { completeOnboardingStep(onboardingStep.id) },
        openSection,
      }, { only: onboardingStep.id })}
    </>
  )
}

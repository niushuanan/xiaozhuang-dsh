import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { embeddedDshPaneUrl } from '@deepseek-ai/dsh-client-runtime/client'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MultiPaneCoordinator } from './coordinator.ts'
import css from './SplitPaneWorkspace.module.css'

interface SplitPaneInjected {
  coordinator: MultiPaneCoordinator
}

const PRIMARY_PANE_ID = 'primary'
const PANE_LAYOUT_STORAGE_KEY = 'dsh.multi-pane.layout.v1'
const MIN_PANE_WIDTH = 180
const KEYBOARD_RESIZE_STEP = 24

interface StoredPaneLayout {
  ids: readonly string[]
  ratios: readonly number[]
}

function equalRatios(count: number): readonly number[] {
  return Array.from({ length: count }, () => 1 / count)
}

function validRatios(value: unknown, count: number): value is readonly number[] {
  return Array.isArray(value)
    && value.length === count
    && value.every(item => typeof item === 'number' && Number.isFinite(item) && item > 0)
}

function readPaneLayout(ids: readonly string[]): readonly number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PANE_LAYOUT_STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return equalRatios(ids.length)
    const storedIds = Reflect.get(value, 'ids')
    const storedRatios = Reflect.get(value, 'ratios')
    if (!Array.isArray(storedIds)
      || storedIds.length !== ids.length
      || storedIds.some((id, index) => id !== ids[index])
      || !validRatios(storedRatios, ids.length)) return equalRatios(ids.length)
    const sum = storedRatios.reduce((total, ratio) => total + ratio, 0)
    return storedRatios.map(ratio => ratio / sum)
  } catch {
    return equalRatios(ids.length)
  }
}

function storePaneLayout(ids: readonly string[], ratios: readonly number[]): void {
  try {
    const value: StoredPaneLayout = { ids, ratios }
    localStorage.setItem(PANE_LAYOUT_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage can be unavailable in a hardened browser; resizing still works for the current page.
  }
}

function paneWorkspaceWidth(group: HTMLElement | null): number {
  let ancestor = group?.parentElement ?? null
  while (ancestor !== null) {
    const width = ancestor.getBoundingClientRect().width
    if (width > 0) return width
    ancestor = ancestor.parentElement
  }
  return group?.getBoundingClientRect().width ?? 0
}

/** Resize only the panes touching one separator, preserving every other pane. */
export function resizeAdjacentPanes(
  ratios: readonly number[],
  boundary: number,
  deltaPx: number,
  totalWidth: number,
): readonly number[] {
  if (boundary < 0 || boundary >= ratios.length - 1 || totalWidth <= 0) return ratios
  // Keep every conversation operable while still allowing a meaningful resize on
  // four-column and narrow layouts. The floor scales down only when the whole
  // workspace is already compact; wide layouts retain the 180px product floor.
  const adaptiveMinimum = Math.min(
    MIN_PANE_WIDTH,
    Math.max(120, totalWidth / ratios.length * 0.6),
  )
  const minimumRatio = adaptiveMinimum / totalWidth
  const pairTotal = (ratios[boundary] ?? 0) + (ratios[boundary + 1] ?? 0)
  const left = Math.min(
    pairTotal - minimumRatio,
    Math.max(minimumRatio, (ratios[boundary] ?? 0) + deltaPx / totalWidth),
  )
  if (!Number.isFinite(left) || left <= 0 || pairTotal - left <= 0) return ratios
  const next = [...ratios]
  next[boundary] = left
  next[boundary + 1] = pairTotal - left
  return next
}

interface PaneResizeHandleProps {
  boundary: number
  left: string
  valueNow: number
  label: string
  ratios: readonly number[]
  workspaceWidth: () => number
  onResize: (next: readonly number[]) => void
  onCommit: () => void
  onReset: () => void
  onDraggingChange: (dragging: boolean) => void
}

function PaneResizeHandle(props: PaneResizeHandleProps) {
  const origin = useRef(0)
  const latest = useRef(0)
  const startRatios = useRef(props.ratios)
  const frame = useRef<number | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
  }, [])

  const resizeAt = useCallback((clientX: number) => {
    callbacks.current.onResize(resizeAdjacentPanes(
      startRatios.current,
      callbacks.current.boundary,
      clientX - origin.current,
      callbacks.current.workspaceWidth(),
    ))
  }, [])

  const finishPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    resizeAt(latest.current)
    callbacks.current.onDraggingChange(false)
    callbacks.current.onCommit()
  }, [resizeAt])

  return (
    <div
      className={css.resizer}
      style={{ left: props.left }}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={props.valueNow}
      data-pane-boundary={props.boundary}
      onDoubleClick={(event) => {
        event.preventDefault()
        props.onReset()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          props.onReset()
          return
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const delta = event.key === 'ArrowLeft' ? -KEYBOARD_RESIZE_STEP : KEYBOARD_RESIZE_STEP
        props.onResize(resizeAdjacentPanes(
          props.ratios,
          props.boundary,
          delta,
          props.workspaceWidth(),
        ))
        queueMicrotask(props.onCommit)
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        origin.current = event.clientX
        latest.current = event.clientX
        startRatios.current = props.ratios
        props.onDraggingChange(true)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        latest.current = event.clientX
        frame.current ??= requestAnimationFrame(() => {
          frame.current = null
          resizeAt(latest.current)
        })
      }}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    />
  )
}

export type SplitPaneWorkspaceProps =
  & PropsRuntime<'conversation.session.panes'>
  & PropsLocale<'multiWindow'>
  & InjectFace<SplitPaneInjected>

/** Secondary full conversation documents sharing the primary page's workspace. */
export function SplitPaneWorkspace({ useSessions, coordinator, t }: SplitPaneWorkspaceProps) {
  const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot)
  const titles = useSessions(s => s.byId)
  const currentSessionId = useSessions(s => s.current)
  const groupRef = useRef<HTMLDivElement | null>(null)
  const paneIds = useMemo(
    () => [PRIMARY_PANE_ID, ...snapshot.panes.map(pane => pane.paneId)],
    [snapshot.panes],
  )
  const paneKey = paneIds.join('|')
  const [ratios, setRatios] = useState<readonly number[]>(() => readPaneLayout(paneIds))
  const [dragging, setDragging] = useState(false)
  const ratiosRef = useRef(ratios)
  const currentRatios = ratios.length === paneIds.length ? ratios : equalRatios(paneIds.length)
  ratiosRef.current = currentRatios

  useEffect(() => {
    const next = readPaneLayout(paneIds)
    ratiosRef.current = next
    setRatios(next)
  }, [paneKey])

  const workspaceWidth = useCallback(() => paneWorkspaceWidth(groupRef.current), [])
  const updateRatios = useCallback((next: readonly number[]) => {
    ratiosRef.current = next
    setRatios(next)
  }, [])
  const commitRatios = useCallback(() => {
    storePaneLayout(paneIds, ratiosRef.current)
  }, [paneKey])
  const resetRatios = useCallback(() => {
    const next = equalRatios(paneIds.length)
    updateRatios(next)
    storePaneLayout(paneIds, next)
  }, [paneKey, updateRatios])

  if (snapshot.panes.length === 0) return null
  const primaryTitle = currentSessionId === undefined
    ? t('pane.untitled')
    : titles[currentSessionId]?.displayTitle ?? t('pane.untitled')
  const paneTitles = [primaryTitle, ...snapshot.panes.map(pane => (
    titles[pane.sessionId]?.displayTitle ?? t('pane.untitled')
  ))]
  const secondaryShare = currentRatios.slice(1).reduce((sum, ratio) => sum + ratio, 0)
  const secondaryColumns = currentRatios
    .slice(1)
    .map(ratio => `${ratio / secondaryShare}fr`)
    .join(' ')
  const handles = Array.from({ length: currentRatios.length - 1 }, (_, boundary) => {
    const groupPosition = boundary === 0
      ? 0
      : currentRatios.slice(1, boundary + 1).reduce((sum, ratio) => sum + ratio, 0) / secondaryShare
    const cumulative = currentRatios.slice(0, boundary + 1).reduce((sum, ratio) => sum + ratio, 0)
    return (
      <PaneResizeHandle
        key={`boundary-${boundary}`}
        boundary={boundary}
        left={`${groupPosition * 100}%`}
        valueNow={Math.round(cumulative * 100)}
        label={t('pane.resize', {
          left: paneTitles[boundary] ?? t('pane.untitled'),
          right: paneTitles[boundary + 1] ?? t('pane.untitled'),
        })}
        ratios={currentRatios}
        workspaceWidth={workspaceWidth}
        onResize={updateRatios}
        onCommit={commitRatios}
        onReset={resetRatios}
        onDraggingChange={setDragging}
      />
    )
  })
  return (
    <div
      ref={groupRef}
      className={css.group}
      data-multi-pane-group=""
      data-resizing={dragging || undefined}
      style={{
        '--dsh-secondary-pane-count': snapshot.panes.length,
        flexBasis: `${secondaryShare * 100}%`,
        gridTemplateColumns: secondaryColumns,
      } as CSSProperties}
    >
      {snapshot.panes.map((pane, index) => {
        const title = paneTitles[index + 1] ?? t('pane.untitled')
        return (
          <section key={pane.paneId} className={css.pane} aria-label={title} data-pane-id={pane.paneId}>
            <iframe
              className={css.frame}
              src={embeddedDshPaneUrl(location.href, pane.paneId, pane.sessionId)}
              title={title}
              loading="eager"
              allow="clipboard-read; clipboard-write"
            />
            <button
              type="button"
              className={css.close}
              aria-label={t('pane.close', { title })}
              onClick={() => { coordinator.closePane(pane.paneId) }}
            >
              <IconCloseOutline16 size={14} />
            </button>
          </section>
        )
      })}
      {handles}
    </div>
  )
}

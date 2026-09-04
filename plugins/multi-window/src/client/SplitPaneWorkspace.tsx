import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MultiPaneCoordinator } from './coordinator.ts'
import css from './SplitPaneWorkspace.module.css'
import { embeddedDshPaneUrl, SESSION_DRAG_MIME } from './window-contract.ts'

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
    const storedIds: unknown = Reflect.get(value, 'ids')
    const storedRatios: unknown = Reflect.get(value, 'ratios')
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

/** Resolve the assembled conversation frame across the renderer's slot wrapper. */
function conversationDropSurface(group: HTMLElement | null): HTMLElement | null {
  const immediate = group?.parentElement ?? null
  let ancestor = immediate
  while (ancestor !== null) {
    if (ancestor.querySelector('[data-conversation-scroll]') !== null) return ancestor
    ancestor = ancestor.parentElement
  }
  return immediate
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

function DropSplitIcon() {
  return (
    <svg className={css.dropIcon} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.75" y="3.25" width="14.5" height="13.5" rx="2.25" />
      <path d="M10 3.5v13" />
      <path d="m12.75 8 2 2-2 2" />
    </svg>
  )
}

/** Secondary full conversation documents sharing the primary page's workspace. */
export function SplitPaneWorkspace({ useSessions, coordinator, t }: SplitPaneWorkspaceProps) {
  const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot)
  const titles = useSessions(s => s.byId)
  const currentSessionId = useSessions(s => s.current)
  const groupRef = useRef<HTMLDivElement | null>(null)
  const [dropActive, setDropActive] = useState(false)
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

  useEffect(() => {
    const ownerDocument = groupRef.current?.ownerDocument
    if (ownerDocument === undefined) return
    const compatible = (event: DragEvent): boolean => (
      Array.from(event.dataTransfer?.types ?? []).includes(SESSION_DRAG_MIME)
    )
    // Slots can mount before the conversation skeleton. Resolve the assembled
    // surface at event time so a later-mounted scroll body is immediately live.
    const surfaceFor = (event: DragEvent): HTMLElement | null => {
      const frame = conversationDropSurface(groupRef.current)
      const target = event.target
      return frame !== null && target instanceof Node && frame.contains(target) ? frame : null
    }
    const activate = (event: DragEvent): void => {
      if (!compatible(event) || surfaceFor(event) === null) return
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = snapshot.atLimit ? 'none' : 'copy'
      setDropActive(true)
    }
    const leave = (event: DragEvent): void => {
      const frame = surfaceFor(event)
      if (frame === null) return
      const related = event.relatedTarget
      if (related instanceof Node && frame.contains(related)) return
      setDropActive(false)
    }
    const drop = (event: DragEvent): void => {
      if (!compatible(event) || surfaceFor(event) === null) return
      event.preventDefault()
      event.stopPropagation()
      setDropActive(false)
      const transfer = event.dataTransfer
      if (transfer === null || snapshot.atLimit) return
      const raw = transfer.getData(SESSION_DRAG_MIME)
      if (raw === '' || !Object.hasOwn(titles, raw)) return
      const result = coordinator.openSession(raw as SessionId)
      if (result !== 'limit') transfer.dropEffect = 'copy'
    }
    const clear = (): void => { setDropActive(false) }
    ownerDocument.addEventListener('dragenter', activate)
    ownerDocument.addEventListener('dragover', activate)
    ownerDocument.addEventListener('dragleave', leave)
    ownerDocument.addEventListener('drop', drop)
    window.addEventListener('dragend', clear)
    return () => {
      ownerDocument.removeEventListener('dragenter', activate)
      ownerDocument.removeEventListener('dragover', activate)
      ownerDocument.removeEventListener('dragleave', leave)
      ownerDocument.removeEventListener('drop', drop)
      window.removeEventListener('dragend', clear)
    }
  }, [coordinator, snapshot.atLimit, titles])

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
      data-auxiliary-pane-group=""
      data-resizing={dragging || undefined}
      data-empty={snapshot.panes.length === 0 || undefined}
      data-drop-active={dropActive || undefined}
      style={{
        '--dsh-secondary-pane-count': snapshot.panes.length,
        flexBasis: `${secondaryShare * 100}%`,
        gridTemplateColumns: secondaryColumns,
      } as CSSProperties}
    >
      {dropActive && (
        <div className={css.dropOverlay} role="status">
          <DropSplitIcon />
          <span>{t(snapshot.atLimit ? 'drop.limit' : 'drop.open')}</span>
        </div>
      )}
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

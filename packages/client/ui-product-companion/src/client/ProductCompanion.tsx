import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { deriveCompanionActivity } from './activity.ts'
import {
  nearestHabitat, resolveHabitat, type HabitatAnchors,
} from './habitats.ts'
import type { CompanionLocaleKey } from './locales.ts'
import {
  createCompanionStore, type CompanionHabitat, type CompanionPosition, type CompanionSkin,
} from './store.ts'
import css from './ProductCompanion.module.css'

export type CompanionVisualState = 'idle' | 'working' | 'waiting' | 'success' | 'sleep'
export type CompanionSequence = 'sidebar' | 'header' | 'composer' | 'task' | 'rest'

type ProductCompanionProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createCompanionStore>>
  & PropsLocale<'productCompanion'>

interface Viewport {
  width: number
  height: number
}

interface DragSession {
  pointerId: number
  origin: CompanionPosition
  clientX: number
  clientY: number
  moved: boolean
}

type IdleGesture = 'rest' | 'look' | 'wave'
type CompanionMotion = 'rest' | 'hop' | 'scurry' | 'drag'

const PET_WIDTH = 132
const PET_HEIGHT = 118
const EDGE = 8
const SLEEP_AFTER_MS = 90_000
const SUCCESS_MS = 4_000
const PROGRESS_REVEAL_MS = 420
const INTERACTION_MS = 1_100
const IDLE_GESTURE_GAP_MS = 7_500
const IDLE_GESTURE_MS = 2_100
const ASSET_ROOT = '/plugins/ui-product-companion/assets'
const FRAME_COUNT = 6
const SEQUENCES: readonly CompanionSequence[] = ['sidebar', 'header', 'composer', 'task', 'rest']

function readViewport(): Viewport {
  return {
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }
}

function clampPosition(position: CompanionPosition, viewport: Viewport): CompanionPosition {
  return {
    x: Math.max(EDGE, Math.min(position.x, viewport.width - PET_WIDTH - EDGE)),
    y: Math.max(48, Math.min(position.y, viewport.height - PET_HEIGHT - EDGE)),
  }
}

function visibleRect(element: Element | null): DOMRect | null {
  if (!(element instanceof HTMLElement)) return null
  const rect = element.getBoundingClientRect()
  return rect.width > 40 && rect.height > 30 ? rect : null
}

/** Measure only the stable product surfaces the companion may inhabit. */
function measureHabitats(viewport: Viewport): HabitatAnchors {
  const overlay = document.querySelector('[data-shell-overlay]')
  const frame = overlay?.parentElement ?? null
  const sidebar = visibleRect(frame?.firstElementChild ?? null)
  const header = visibleRect(document.querySelector('header'))
  const composer = visibleRect(document.querySelector('[data-composer-card]'))
  const dialogOpen = document.querySelector('[role="dialog"]') !== null
  const sidebarRight = sidebar?.right ?? (viewport.width >= 760 ? 236 : 56)
  const sidebarY = Math.max(104, Math.min(viewport.height - PET_HEIGHT - 150, viewport.height * 0.3))
  return {
    sidebar: clampPosition({ x: sidebarRight - 42, y: sidebarY }, viewport),
    header: !dialogOpen && header !== null && viewport.width >= 860
      ? clampPosition({
        x: header.left + Math.max(180, header.width * 0.56),
        y: header.bottom - PET_HEIGHT * 0.68,
      }, viewport)
      : null,
    composer: !dialogOpen && composer !== null
      ? clampPosition({
        x: composer.right - PET_WIDTH - 14,
        y: composer.top - PET_HEIGHT + 18,
      }, viewport)
      : null,
  }
}

/** Public and testable frame URL contract. */
export function companionFrameUrl(
  skin: CompanionSkin,
  sequence: CompanionSequence,
  frame = 0,
): string {
  const bounded = Math.max(0, Math.min(FRAME_COUNT - 1, Math.floor(frame)))
  return `${ASSET_ROOT}/v2/${skin}-${sequence}-${String(bounded + 1).padStart(2, '0')}.png`
}

function framePattern(
  sequence: CompanionSequence,
  state: CompanionVisualState,
  gesture: IdleGesture,
): readonly number[] {
  if (sequence === 'task') {
    if (state === 'waiting') return [3, 3, 0, 3]
    if (state === 'success') return [4, 5, 4, 5]
    return [0, 1, 2, 1]
  }
  if (sequence === 'rest') {
    if (state === 'sleep') return [3, 4, 4, 3]
    if (gesture === 'wave') return [2, 5, 0]
    if (gesture === 'look') return [1, 3, 0]
    return [0, 1, 0, 5]
  }
  if (gesture === 'wave') return [4, 5, 0]
  if (gesture === 'look') return [1, 2, 3, 0]
  return [0, 1, 2, 3, 4, 5]
}

function frameDelay(sequence: CompanionSequence, state: CompanionVisualState): number {
  if (sequence === 'task' && state === 'working') return 320
  if (sequence === 'task') return 520
  if (state === 'sleep') return 920
  return sequence === 'rest' ? 740 : 560
}

function stateKey(state: CompanionVisualState): CompanionLocaleKey {
  return `state.${state}` as CompanionLocaleKey
}

function formatDuration(seconds: number, t: ProductCompanionProps['t']): string {
  const bounded = Math.max(0, Math.floor(seconds))
  if (bounded < 60) return t('duration.seconds', { seconds: bounded })
  return t('duration.minutes', { minutes: Math.floor(bounded / 60), seconds: bounded % 60 })
}

/** Global product companion, mounted once above all app columns. */
export function ProductCompanion({ useSessions, useStore, actions, t }: ProductCompanionProps) {
  const sessions = useSessions(snapshot => snapshot)
  const activity = useMemo(() => deriveCompanionActivity(sessions), [sessions])
  const skin = useStore(state => state.skin)
  const persistedPosition = useStore(state => state.position)
  // Older persisted records predate semantic homes and intentionally fall back beside the sidebar.
  const storedHome = useStore(state => state.home ?? 'sidebar')
  const showStatus = useStore(state => state.showStatus ?? true)
  const autoTravel = useStore(state => state.autoTravel ?? true)
  const [viewport, setViewport] = useState(readViewport)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [dragPosition, setDragPosition] = useState<CompanionPosition | null>(null)
  const [sleeping, setSleeping] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [gesture, setGesture] = useState<IdleGesture>('rest')
  const [motion, setMotion] = useState<CompanionMotion>('rest')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [lastDurationSeconds, setLastDurationSeconds] = useState<number | null>(null)
  const [progressReady, setProgressReady] = useState(false)
  const [frameStep, setFrameStep] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const previousRunning = useRef(0)
  const runStartedAt = useRef<number | null>(null)
  const previousPlacement = useRef<string | null>(null)
  const idleBeat = useRef(0)
  const dragSafetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const anchors = useMemo(
    () => measureHabitats(viewport),
    [viewport, layoutRevision, sessions.current],
  )
  const requestedHome: CompanionHabitat = autoTravel
    && (activity.state === 'waiting' || activity.state === 'working')
    && anchors.composer !== null
    ? 'composer'
    : storedHome
  const activeHome = requestedHome === 'free'
    ? 'free'
    : resolveHabitat(requestedHome, anchors)
  const position = clampPosition(
    dragPosition
      ?? (activeHome === 'free'
        ? persistedPosition ?? anchors.sidebar
        : anchors[activeHome] ?? anchors.sidebar),
    viewport,
  )

  const wake = useCallback(() => {
    setSleeping(false)
    if (sleepTimer.current !== null) clearTimeout(sleepTimer.current)
    if (activity.state === 'idle') {
      sleepTimer.current = setTimeout(() => { setSleeping(true) }, SLEEP_AFTER_MS)
    }
  }, [activity.state])

  const finishInteraction = useCallback((nextMotion: CompanionMotion = 'rest') => {
    if (interactionTimer.current !== null) clearTimeout(interactionTimer.current)
    interactionTimer.current = setTimeout(() => {
      setGesture('rest')
      setMotion(nextMotion)
    }, INTERACTION_MS)
  }, [])

  useEffect(() => {
    const resize = (): void => {
      setViewport(readViewport())
      setLayoutRevision(value => value + 1)
    }
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize) }
  }, [])

  useEffect(() => {
    for (const sequence of SEQUENCES) {
      for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
        const image = new Image()
        image.src = companionFrameUrl(skin, sequence, frame)
      }
    }
  }, [skin])

  useEffect(() => {
    const noteProductChange = (): void => {
      wake()
      window.setTimeout(() => { setLayoutRevision(value => value + 1) }, 180)
    }
    wake()
    window.addEventListener('pointerdown', noteProductChange)
    return () => {
      window.removeEventListener('pointerdown', noteProductChange)
      if (sleepTimer.current !== null) clearTimeout(sleepTimer.current)
    }
  }, [activity.latestUpdate, wake])

  useEffect(() => {
    const started = previousRunning.current === 0 && activity.running > 0
    const finished = previousRunning.current > 0 && activity.running === 0
    if (started) {
      runStartedAt.current = Date.now()
      setElapsedSeconds(0)
      setLastDurationSeconds(null)
      setProgressReady(false)
      if (progressRevealTimer.current !== null) clearTimeout(progressRevealTimer.current)
      progressRevealTimer.current = setTimeout(() => { setProgressReady(true) }, PROGRESS_REVEAL_MS)
    }
    if (finished) {
      const elapsed = runStartedAt.current === null
        ? null
        : Math.max(1, Math.floor((Date.now() - runStartedAt.current) / 1_000))
      setLastDurationSeconds(elapsed)
      setElapsedSeconds(0)
      setProgressReady(false)
      runStartedAt.current = null
      if (progressRevealTimer.current !== null) clearTimeout(progressRevealTimer.current)
    }
    if (finished && activity.waiting === 0) {
      setCelebrating(true)
      setGesture('wave')
      setMotion('hop')
      if (successTimer.current !== null) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => {
        setCelebrating(false)
        setGesture('rest')
        setMotion('rest')
      }, SUCCESS_MS)
    }
    previousRunning.current = activity.running
    return () => {
      if (successTimer.current !== null) clearTimeout(successTimer.current)
    }
  }, [activity.running, activity.waiting])

  useEffect(() => {
    if (activity.running === 0) return
    const tick = (): void => {
      if (runStartedAt.current === null) runStartedAt.current = Date.now()
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt.current) / 1_000)))
    }
    tick()
    progressTimer.current = setInterval(tick, 1_000)
    return () => {
      if (progressTimer.current !== null) clearInterval(progressTimer.current)
      progressTimer.current = null
    }
  }, [activity.running])

  useEffect(() => {
    if (activity.state !== 'idle' || sleeping || dragRef.current !== null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const schedule = (): void => {
      timer = setTimeout(() => {
        if (cancelled) return
        idleBeat.current += 1
        const nextGesture: IdleGesture = idleBeat.current % 2 === 0 ? 'wave' : 'look'
        setGesture(nextGesture)
        timer = setTimeout(() => {
          if (cancelled) return
          setGesture('rest')
          setMotion('rest')
          schedule()
        }, IDLE_GESTURE_MS)
      }, IDLE_GESTURE_GAP_MS)
    }
    schedule()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activity.state, sleeping])

  useEffect(() => {
    const placement = `${activeHome}:${Math.round(position.x)}:${Math.round(position.y)}`
    if (previousPlacement.current !== null && previousPlacement.current !== placement && motion === 'rest') {
      setMotion('scurry')
      finishInteraction()
    }
    previousPlacement.current = placement
  }, [activeHome, finishInteraction, motion, position.x, position.y])

  useEffect(() => () => {
    if (interactionTimer.current !== null) clearTimeout(interactionTimer.current)
    if (dragSafetyTimer.current !== null) clearTimeout(dragSafetyTimer.current)
    if (progressTimer.current !== null) clearInterval(progressTimer.current)
    if (progressRevealTimer.current !== null) clearTimeout(progressRevealTimer.current)
  }, [])

  const displayState: CompanionVisualState = activity.state === 'waiting'
    ? 'waiting'
    : activity.state === 'working'
      ? 'working'
      : celebrating
        ? 'success'
        : sleeping
          ? 'sleep'
          : 'idle'

  // A quiet companion still changes posture with its current product surface.
  // This keeps semantic task state separate from the frame used for character acting.
  const poseState: CompanionVisualState = activity.state === 'waiting'
    ? 'waiting'
    : activity.state === 'working'
      ? 'working'
      : celebrating || gesture === 'wave'
        ? 'success'
        : hovered || gesture === 'look' || activeHome === 'header'
          ? 'waiting'
          : sleeping
            ? 'sleep'
            : activeHome === 'composer'
              ? 'working'
              : 'idle'

  const sequence: CompanionSequence = activity.state === 'working'
    || activity.state === 'waiting'
    || celebrating
    ? 'task'
    : sleeping
      ? 'rest'
      : activeHome === 'header'
        ? 'header'
        : activeHome === 'composer'
          ? 'composer'
          : activeHome === 'sidebar'
            ? 'sidebar'
            : 'rest'
  const frames = useMemo(
    () => framePattern(sequence, displayState, gesture),
    [displayState, gesture, sequence],
  )
  const frame = frames[frameStep % frames.length] ?? 0

  useEffect(() => {
    setFrameStep(0)
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (media?.matches) return
    const timer = setInterval(
      () => { setFrameStep(step => (step + 1) % frames.length) },
      frameDelay(sequence, displayState),
    )
    return () => { clearInterval(timer) }
  }, [displayState, frames.length, sequence])

  const interact = (): void => {
    wake()
    setGesture('wave')
    setMotion('hop')
    finishInteraction()
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      origin: position,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
    }
    setMotion('drag')
    if (dragSafetyTimer.current !== null) clearTimeout(dragSafetyTimer.current)
    dragSafetyTimer.current = setTimeout(() => {
      dragRef.current = null
      setDragPosition(null)
      setMotion('rest')
    }, 5_000)
    wake()
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    const rect = event.currentTarget.getBoundingClientRect()
    const lookX = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)))
    const lookY = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)))
    rootRef.current?.style.setProperty('--look-x', `${lookX * 2}px`)
    rootRef.current?.style.setProperty('--look-y', `${lookY * 1.5}px`)
    rootRef.current?.style.setProperty('--look-rotate', `${lookX * 1.2}deg`)
    if (drag === null || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.clientX
    const deltaY = event.clientY - drag.clientY
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return
    drag.moved = true
    setDragPosition(clampPosition({ x: drag.origin.x + deltaX, y: drag.origin.y + deltaY }, viewport))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
    if (dragSafetyTimer.current !== null) clearTimeout(dragSafetyTimer.current)
    if (drag.moved) {
      const settled = clampPosition({
        x: drag.origin.x + event.clientX - drag.clientX,
        y: drag.origin.y + event.clientY - drag.clientY,
      }, viewport)
      const snapped = nearestHabitat(settled, anchors)
      if (snapped === 'free') actions.setPosition(settled)
      else actions.setHome(snapped)
      setDragPosition(null)
      setMotion('hop')
      finishInteraction()
      return
    }
    interact()
  }

  const onPointerCancel = (): void => {
    dragRef.current = null
    if (dragSafetyTimer.current !== null) clearTimeout(dragSafetyTimer.current)
    setDragPosition(null)
    setMotion('rest')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    interact()
  }

  const style = { left: position.x, top: position.y } satisfies CSSProperties
  const activeDuration = elapsedSeconds > 0 ? formatDuration(elapsedSeconds, t) : null
  const completedDuration = lastDurationSeconds === null ? null : formatDuration(lastDurationSeconds, t)
  const bubbleLabel = activity.state === 'waiting'
    ? t('bubble.waiting')
    : activity.state === 'working' && progressReady
      ? t('bubble.working')
      : celebrating
        ? t('bubble.success')
        : null
  const bubbleDuration = activity.state === 'working' || activity.state === 'waiting'
    ? activeDuration
    : completedDuration
  const bubble = showStatus && bubbleLabel !== null
    ? [bubbleLabel, bubbleDuration].filter(value => value !== null).join(' · ')
    : null
  const bubbleAlign = position.x < 58
    ? 'left'
    : position.x > viewport.width - PET_WIDTH - 58
      ? 'right'
      : 'center'

  return (
    <div
      ref={rootRef}
      className={css.root}
      style={style}
      data-product-companion=""
      data-state={displayState}
      data-pose={poseState}
      data-sequence={sequence}
      data-frame={frame}
      data-skin={skin}
      data-habitat={activeHome}
      data-motion={motion}
      data-bubble-align={bubbleAlign}
    >
      {bubble !== null ? <div className={css.bubble} aria-hidden="true">{bubble}</div> : null}
      <button
        type="button"
        className={css.character}
        aria-label={t('interact')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={() => { setHovered(true); wake() }}
        onPointerLeave={() => {
          if (dragRef.current === null) setHovered(false)
          rootRef.current?.style.removeProperty('--look-x')
          rootRef.current?.style.removeProperty('--look-y')
          rootRef.current?.style.removeProperty('--look-rotate')
        }}
        onKeyDown={onKeyDown}
      >
        <img
          className={css.characterImage}
          src={companionFrameUrl(skin, sequence, frame)}
          alt=""
          draggable={false}
        />
      </button>
      <span className={css.srOnly} aria-live="polite">{t(stateKey(displayState))}</span>
    </div>
  )
}

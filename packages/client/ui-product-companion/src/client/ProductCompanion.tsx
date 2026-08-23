import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { deriveCompanionActivity } from './activity.ts'
import {
  nearestHabitat, nextHabitat, resolveHabitat, type HabitatAnchors,
} from './habitats.ts'
import type { CompanionLocaleKey } from './locales.ts'
import {
  createCompanionStore, type CompanionHabitat, type CompanionPosition, type CompanionSkin,
} from './store.ts'
import css from './ProductCompanion.module.css'

export type CompanionVisualState = 'idle' | 'working' | 'waiting' | 'success' | 'sleep'

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

const PET_WIDTH = 108
const PET_HEIGHT = 94
const EDGE = 8
const SLEEP_AFTER_MS = 90_000
const SUCCESS_MS = 4_000
const INTERACTION_MS = 1_100
const IDLE_GESTURE_GAP_MS = 7_500
const IDLE_GESTURE_MS = 2_100
const ASSET_ROOT = '/plugins/ui-product-companion/assets'
const STATES: readonly CompanionVisualState[] = ['idle', 'working', 'waiting', 'success', 'sleep']
const SKINS: readonly CompanionSkin[] = ['blue', 'black']

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
    sidebar: clampPosition({ x: sidebarRight - 24, y: sidebarY }, viewport),
    header: !dialogOpen && header !== null && viewport.width >= 860
      ? clampPosition({
        x: header.left + Math.max(180, header.width * 0.56),
        y: header.bottom - PET_HEIGHT * 0.48,
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
export function companionFrameUrl(skin: CompanionSkin, state: CompanionVisualState): string {
  return `${ASSET_ROOT}/${skin}-${state}.png`
}

function stateKey(state: CompanionVisualState): CompanionLocaleKey {
  return `state.${state}` as CompanionLocaleKey
}

/** Global product companion, mounted once above all app columns. */
export function ProductCompanion({ useSessions, useStore, actions, t }: ProductCompanionProps) {
  const sessions = useSessions(snapshot => snapshot)
  const activity = useMemo(() => deriveCompanionActivity(sessions), [sessions])
  const skin = useStore(state => state.skin)
  const persistedPosition = useStore(state => state.position)
  // Older persisted records predate semantic homes and intentionally fall back beside the sidebar.
  const storedHome = useStore(state => state.home ?? 'sidebar')
  const [viewport, setViewport] = useState(readViewport)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [dragPosition, setDragPosition] = useState<CompanionPosition | null>(null)
  const [sleeping, setSleeping] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [gesture, setGesture] = useState<IdleGesture>('rest')
  const [motion, setMotion] = useState<CompanionMotion>('rest')
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const previousRunning = useRef(activity.running)
  const previousPlacement = useRef<string | null>(null)
  const idleBeat = useRef(0)
  const dragSafetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const anchors = useMemo(
    () => measureHabitats(viewport),
    [viewport, layoutRevision, sessions.current],
  )
  const requestedHome: CompanionHabitat = activity.state === 'waiting' && anchors.composer !== null
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
    for (const candidateSkin of SKINS) {
      for (const state of STATES) {
        const image = new Image()
        image.src = companionFrameUrl(candidateSkin, state)
      }
    }
  }, [])

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
    if (previousRunning.current > 0 && activity.running === 0 && activity.waiting === 0) {
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
    if (activity.state !== 'idle' || sleeping || dragRef.current !== null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const schedule = (): void => {
      timer = setTimeout(() => {
        if (cancelled) return
        idleBeat.current += 1
        const nextGesture: IdleGesture = idleBeat.current % 2 === 0 ? 'wave' : 'look'
        setGesture(nextGesture)
        if (storedHome !== 'free' && idleBeat.current % 3 === 0) {
          setMotion('scurry')
          actions.setHome(nextHabitat(activeHome, anchors))
        }
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
  }, [actions, activeHome, activity.state, anchors, sleeping, storedHome])

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

  const interact = (): void => {
    wake()
    setGesture('wave')
    setMotion('hop')
    actions.setHome(nextHabitat(activeHome, anchors))
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
  const bubble = activity.state === 'waiting'
    ? t('bubble.waiting')
    : celebrating
      ? t('bubble.success')
      : null

  return (
    <div
      ref={rootRef}
      className={css.root}
      style={style}
      data-product-companion=""
      data-state={displayState}
      data-pose={poseState}
      data-skin={skin}
      data-habitat={activeHome}
      data-motion={motion}
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
          key={`${skin}-${poseState}`}
          className={css.characterImage}
          src={companionFrameUrl(skin, poseState)}
          alt=""
          draggable={false}
        />
      </button>
      <span className={css.srOnly} aria-live="polite">{t(stateKey(displayState))}</span>
    </div>
  )
}

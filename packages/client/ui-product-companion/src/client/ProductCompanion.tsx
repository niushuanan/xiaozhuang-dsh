import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { deriveCompanionActivity } from './activity.ts'
import type { CompanionLocaleKey } from './locales.ts'
import { createCompanionStore, type CompanionPosition, type CompanionSkin } from './store.ts'
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

const PET_WIDTH = 120
const PET_HEIGHT = 104
const EDGE = 10
const SLEEP_AFTER_MS = 90_000
const SUCCESS_MS = 4_000
const ASSET_ROOT = '/plugins/ui-product-companion/assets'
const STATES: readonly CompanionVisualState[] = ['idle', 'working', 'waiting', 'success', 'sleep']
const SKINS: readonly CompanionSkin[] = ['blue', 'black']

function readViewport(): Viewport {
  return {
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }
}

function defaultPosition(viewport: Viewport): CompanionPosition {
  const besideSidebar = viewport.width >= 760 ? 236 : 14
  return clampPosition({ x: besideSidebar, y: viewport.height - PET_HEIGHT - 76 }, viewport)
}

function clampPosition(position: CompanionPosition, viewport: Viewport): CompanionPosition {
  return {
    x: Math.max(EDGE, Math.min(position.x, viewport.width - PET_WIDTH - EDGE)),
    y: Math.max(52, Math.min(position.y, viewport.height - PET_HEIGHT - EDGE)),
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
  const [viewport, setViewport] = useState(readViewport)
  const [dragPosition, setDragPosition] = useState<CompanionPosition | null>(null)
  const [open, setOpen] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const previousRunning = useRef(activity.running)
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const position = clampPosition(
    dragPosition ?? persistedPosition ?? defaultPosition(viewport),
    viewport,
  )

  const wake = useCallback(() => {
    setSleeping(false)
    if (sleepTimer.current !== null) clearTimeout(sleepTimer.current)
    if (activity.state === 'idle') {
      sleepTimer.current = setTimeout(() => { setSleeping(true) }, SLEEP_AFTER_MS)
    }
  }, [activity.state])

  useEffect(() => {
    const resize = (): void => { setViewport(readViewport()) }
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
    wake()
    window.addEventListener('pointerdown', wake)
    return () => {
      window.removeEventListener('pointerdown', wake)
      if (sleepTimer.current !== null) clearTimeout(sleepTimer.current)
    }
  }, [activity.latestUpdate, wake])

  useEffect(() => {
    if (previousRunning.current > 0 && activity.running === 0 && activity.waiting === 0) {
      setCelebrating(true)
      if (successTimer.current !== null) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => { setCelebrating(false) }, SUCCESS_MS)
    }
    previousRunning.current = activity.running
    return () => {
      if (successTimer.current !== null) clearTimeout(successTimer.current)
    }
  }, [activity.running, activity.waiting])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside, true)
    return () => { document.removeEventListener('pointerdown', closeOutside, true) }
  }, [open])

  const visualState: CompanionVisualState = activity.state === 'waiting'
    ? 'waiting'
    : activity.state === 'working'
      ? 'working'
      : celebrating
        ? 'success'
        : sleeping
          ? 'sleep'
          : 'idle'

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      origin: position,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
    }
    wake()
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
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
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
    if (drag.moved) {
      const settled = {
        x: drag.origin.x + event.clientX - drag.clientX,
        y: drag.origin.y + event.clientY - drag.clientY,
      }
      actions.setPosition(clampPosition(settled, viewport))
      setDragPosition(null)
      return
    }
    setOpen(value => !value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    wake()
    setOpen(value => !value)
  }

  const onReset = (): void => {
    setDragPosition(null)
    actions.resetPosition()
  }

  const style = { left: position.x, top: position.y } satisfies CSSProperties
  const panelSide = position.x + PET_WIDTH + 280 < viewport.width ? 'right' : 'left'
  const statusCopy = t(stateKey(visualState))
  const summary = activity.running === 0 && activity.waiting === 0
    ? t('summary.empty')
    : t('summary.counts', { running: activity.running, waiting: activity.waiting })

  return (
    <div
      ref={rootRef}
      className={css.root}
      style={style}
      data-product-companion=""
      data-state={visualState}
      data-skin={skin}
    >
      {activity.state === 'waiting' && !open ? (
        <div className={css.attention} role="status">{t('state.waiting')}</div>
      ) : null}
      <button
        type="button"
        className={css.character}
        aria-label={t(open ? 'close' : 'open')}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; setDragPosition(null) }}
        onKeyDown={onKeyDown}
      >
        <img
          key={`${skin}-${visualState}`}
          className={css.frame}
          src={companionFrameUrl(skin, visualState)}
          alt=""
          draggable={false}
        />
      </button>

      {open ? (
        <section
          className={css.panel}
          data-side={panelSide}
          aria-label={t('name')}
        >
          <div className={css.panelHeader}>
            <strong>{t('name')}</strong>
            <span className={css.liveState} data-state={visualState}>{statusCopy}</span>
          </div>
          {activity.focusTitle !== null ? (
            <p className={css.focusTitle} title={activity.focusTitle}>{activity.focusTitle}</p>
          ) : null}
          <p className={css.summary}>{summary}</p>
          <div className={css.divider} />
          <div className={css.preferenceRow}>
            <span>{t('section.skin')}</span>
            <div className={css.segmented} role="group" aria-label={t('section.skin')}>
              {SKINS.map(candidate => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={skin === candidate}
                  onClick={() => { actions.setSkin(candidate) }}
                >
                  {t(`skin.${candidate}`)}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className={css.reset} onClick={onReset}>{t('reset')}</button>
          <p className={css.hint}>{t('hint')}</p>
        </section>
      ) : null}
    </div>
  )
}

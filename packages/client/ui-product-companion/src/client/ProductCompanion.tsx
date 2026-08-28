import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SessionPendingInteractionSnapshot, UseSessionPendingInteraction,
} from '@deepseek-ai/dsh-client-ui-session/client'
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { deriveCompanionActivity, deriveCompanionTasks, type CompanionTask } from './activity.ts'
import type { CompanionLocaleKey } from './locales.ts'
import {
  COMPANION_ASSET_FRAME_COUNTS,
  COMPANION_DISSOLVE_FRAME_COUNT, COMPANION_DISSOLVE_PHASE_MS,
  COMPANION_FOCUS_SEQUENCE,
  COMPANION_LOUNGE_SEQUENCE, COMPANION_SUCCESS_SEQUENCE,
  COMPANION_TRACKS, COMPANION_WAITING_SEQUENCE,
  companionSequenceFrame,
  type CompanionAssetClip, type CompanionTrackName,
} from './animation.ts'
import {
  createCompanionStore,
  DEFAULT_COMPANION_NAME, DEFAULT_VOICE_SHORTCUT,
  type CompanionAction, type CompanionPosition, type CompanionSize, type CompanionSkin,
} from './store.ts'
import { composerRatioForX, composerXForRatio, composerYForTop } from './composer-anchor.ts'
import { useVoiceInput } from './voice-input.ts'
import css from './ProductCompanion.module.css'

export type CompanionVisualState = 'idle' | 'working' | 'waiting' | 'success' | 'sleep'

type ProductCompanionProps =
  Omit<PropsRuntime<'shell.overlay'>, 'useSessionPendingInteraction'>
  & { useSessionPendingInteraction?: UseSessionPendingInteraction }
  & PropsStore<ReturnType<typeof createCompanionStore>>
  & PropsLocale<'productCompanion'>
  & ProductCompanionInjected

export interface ProductCompanionInjected {
  /** Reuse the shell's current-workspace-aware New Session action. */
  startSession?: () => void
  /** Reuse the session runtime's canonical navigation path. */
  openSession?: (id: SessionId) => void
}

interface Viewport {
  width: number
  height: number
}

const PET_WIDTH = 132
const PET_HEIGHT = 118
const EDGE = 8
const SLEEP_AFTER_MS = 90_000
const SUCCESS_MS = 4_000
const PROGRESS_REVEAL_MS = 420
const TASK_PANEL_EXIT_MS = 260
const SESSION_ANCHOR_SETTLE_MS = 360
const MIN_TELEPORT_DISTANCE = 6
/** Horizontal pointer travel (px) that turns a press into a drag. */
const DRAG_START_PX = 5
const WORK_PULSE_COOLDOWN_MS = 5_200
const ASSET_ROOT = '/plugins/ui-product-companion/assets'
const UNDERLYING_INTERACTIVE_SELECTOR = [
  'button:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ')

type TeleportPhase = 'idle' | 'departing' | 'arriving'

function readViewport(): Viewport {
  return {
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }
}

function companionSize(
  viewport: Viewport,
  preference: CompanionSize,
): { width: number; height: number; bottomInset: number } {
  if (viewport.width <= 680) {
    return preference === 'large'
      ? { width: 144, height: 129, bottomInset: 14 }
      : { width: 116, height: 104, bottomInset: 11 }
  }
  return preference === 'large'
    ? { width: 164, height: 147, bottomInset: 15 }
    : { width: PET_WIDTH, height: PET_HEIGHT, bottomInset: 12 }
}

function clampPosition(
  position: CompanionPosition,
  viewport: Viewport,
  preference: CompanionSize,
): CompanionPosition {
  const size = companionSize(viewport, preference)
  return {
    x: Math.max(EDGE, Math.min(position.x, viewport.width - size.width - EDGE)),
    y: Math.max(48, Math.min(position.y, viewport.height - size.height - EDGE)),
  }
}

function visibleRect(element: Element | null): DOMRect | null {
  if (!(element instanceof HTMLElement)) return null
  const rect = element.getBoundingClientRect()
  return rect.width > 40 && rect.height > 30 ? rect : null
}

function hasBlockingModal(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null
}

/**
 * Keep the companion visually above the app while giving an actionable element
 * beneath its canvas the first primary-click. The root is temporarily removed
 * from hit-testing only to ask the browser what it covers; nothing is moved or
 * hidden from the user.
 */
function underlyingInteractiveTarget(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  if (typeof document.elementsFromPoint !== 'function') return null
  const previousPointerEvents = root.style.pointerEvents
  try {
    root.style.pointerEvents = 'none'
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      const target = element.closest<HTMLElement>(UNDERLYING_INTERACTIVE_SELECTOR)
      if (target !== null && !root.contains(target)) return target
    }
    return null
  } finally {
    root.style.pointerEvents = previousPointerEvents
  }
}

/**
 * Measure the composer card and place the companion at the user's persisted
 * horizontal offset ratio (1 = the historical right berth, 0 = the left inset),
 * so any later composer move or resize keeps the same relative berth.
 */
function measureComposerAnchor(
  viewport: Viewport,
  preference: CompanionSize,
  offsetRatio: number,
): CompanionPosition | null {
  const composer = visibleRect(document.querySelector('[data-composer-card]'))
  // Only a true modal owns the whole product surface. Header popovers such as
  // Model Usage also use dialog semantics, but must not unmount an independent
  // shell-overlay plugin merely because their panel is open.
  if (hasBlockingModal() || composer === null) return null
  const size = companionSize(viewport, preference)
  return clampPosition({
    x: composerXForRatio(offsetRatio, composer, size.width),
    y: composerYForTop(composer.top, size.height, size.bottomInset),
  }, viewport, preference)
}

/** Public and testable frame URL contract. */
export function companionFrameUrl(
  skin: CompanionSkin,
  clip: CompanionAssetClip,
  frame = 0,
): string {
  const bounded = Math.max(0, Math.min(COMPANION_ASSET_FRAME_COUNTS[clip] - 1, Math.floor(frame)))
  return `${ASSET_ROOT}/v14/${skin}-${clip}-${String(bounded + 1).padStart(2, '0')}.png`
}

/** Public URL contract for masks applied directly to the current character bitmap. */
export function companionDissolveMaskUrl(
  kind: 'body' | 'fragment',
  frame = 0,
): string {
  const bounded = Math.max(
    0,
    Math.min(COMPANION_DISSOLVE_FRAME_COUNT - 1, Math.floor(frame)),
  )
  return `${ASSET_ROOT}/v13/${kind}-mask-${String(bounded + 1).padStart(2, '0')}.png`
}

function maskStripStyle(kind: 'body' | 'fragment'): CSSProperties {
  return {
    '--companion-material-mask': `url("${ASSET_ROOT}/v13/${kind}-mask-strip.png")`,
  } as CSSProperties
}

function positionDistance(from: CompanionPosition, to: CompanionPosition): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function stateKey(state: CompanionVisualState): CompanionLocaleKey {
  return `state.${state}`
}

function formatDuration(seconds: number, t: ProductCompanionProps['t']): string {
  const bounded = Math.max(0, Math.floor(seconds))
  if (bounded < 60) return t('duration.seconds', { seconds: bounded })
  return t('duration.minutes', { minutes: Math.floor(bounded / 60), seconds: bounded % 60 })
}

function taskStatusKey(status: CompanionTask['status']): CompanionLocaleKey {
  switch (status) {
    case 'approval': return 'task.approval'
    case 'plan-review': return 'task.planReview'
    case 'question': return 'task.question'
    case 'working': return 'task.working'
  }
  return 'task.working'
}

const EMPTY_INTERACTIONS: SessionPendingInteractionSnapshot = new Map()
const useNoPendingInteractions: UseSessionPendingInteraction = selector => selector(EMPTY_INTERACTIONS)

/** Global product companion, mounted once above all app columns. */
export function ProductCompanion({
  useSessions, useSessionPendingInteraction = useNoPendingInteractions,
  useStore, actions, startSession = () => undefined,
  openSession = () => undefined, t,
}: ProductCompanionProps) {
  const sessions = useSessions(snapshot => snapshot)
  const interactions = useSessionPendingInteraction(snapshot => snapshot)
  const activity = useMemo(
    () => deriveCompanionActivity(sessions, interactions), [interactions, sessions],
  )
  const activeTasks = useMemo(
    () => deriveCompanionTasks(sessions, interactions), [interactions, sessions],
  )
  const currentSession = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
  const skin = useStore(state => state.skin)
  const displayName = useStore(state => state.displayName?.trim() || DEFAULT_COMPANION_NAME)
  const visible = useStore(state => state.visible ?? true)
  const sizePreference = useStore(state => state.size ?? 'large')
  const clickAction = useStore(state => state.clickAction ?? 'focusComposer')
  const doubleClickAction = useStore(state => state.doubleClickAction ?? 'newSession')
  const contextAction = useStore(state => state.contextAction ?? 'menu')
  const showStatus = useStore(state => state.showStatus)
  const voiceEnabled = useStore(state => state.voiceEnabled ?? true)
  const voiceShortcut = useStore(state => state.voiceShortcut ?? DEFAULT_VOICE_SHORTCUT)
  const voicePreferences = useMemo(() => ({
    enabled: voiceEnabled,
    shortcut: voiceShortcut,
  }), [voiceEnabled, voiceShortcut])
  const composerOffsetRatio = useStore(state => state.composerOffsetRatio ?? 1)
  const [viewport, setViewport] = useState(readViewport)
  const [viewportResizing, setViewportResizing] = useState(false)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [renderedPosition, setRenderedPosition] = useState<CompanionPosition | null>(null)
  const [teleportPhase, setTeleportPhase] = useState<TeleportPhase>('idle')
  const [menuOpen, setMenuOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [tasksMounted, setTasksMounted] = useState(false)
  const [sleeping, setSleeping] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [lastDurationSeconds, setLastDurationSeconds] = useState<number | null>(null)
  const [progressReady, setProgressReady] = useState(false)
  const [animatedFrame, setAnimatedFrame] = useState(0)
  const [workPulse, setWorkPulse] = useState({ revision: 0, active: false })
  const rootRef = useRef<HTMLDivElement>(null)
  const previousRunning = useRef(0)
  const runStartedAt = useRef<number | null>(null)
  const previousSession = useRef(sessions.current)
  const sessionAnchorSettling = useRef(false)
  const previousAnchor = useRef<CompanionPosition | null>(null)
  const teleportTarget = useRef<CompanionPosition | null>(null)
  const teleportPhaseRef = useRef<TeleportPhase>('idle')
  const currentCharacterSrc = useRef<string | null>(null)
  const frozenTeleportCharacterSrc = useRef<string | null>(null)
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const teleportTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickThroughResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickThroughPress = useRef<{ pointerId: number; target: HTMLElement } | null>(null)
  const suppressCharacterClick = useRef(false)
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const taskPanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousWorkPulseSignature = useRef<string | null>(null)
  const lastWorkPulseAt = useRef<number | null>(null)
  const preloadedAssetUrls = useRef(new Set<string>())
  const retainedPreloadedAssets = useRef(new Map<string, HTMLImageElement>())
  const dragState = useRef<{
    pointerId: number
    pressX: number
    grabOffsetX: number
    moved: boolean
    ratio: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const voice = useVoiceInput({
    preferences: voicePreferences,
    t,
  })

  const openTasks = useCallback(() => {
    if (taskPanelTimer.current !== null) clearTimeout(taskPanelTimer.current)
    taskPanelTimer.current = null
    setTasksMounted(true)
    setTasksOpen(true)
  }, [])

  const closeTasks = useCallback(() => {
    setTasksOpen(false)
    if (taskPanelTimer.current !== null) clearTimeout(taskPanelTimer.current)
    taskPanelTimer.current = setTimeout(() => {
      setTasksMounted(false)
      taskPanelTimer.current = null
    }, TASK_PANEL_EXIT_MS)
  }, [])

  const toggleTasks = useCallback(() => {
    if (tasksOpen) closeTasks()
    else openTasks()
  }, [closeTasks, openTasks, tasksOpen])

  const composerAnchor = useMemo(
    () => measureComposerAnchor(viewport, sizePreference, composerOffsetRatio),
    [viewport, layoutRevision, sizePreference, composerOffsetRatio],
  )
  const renderedSize = companionSize(viewport, sizePreference)
  const position = renderedPosition ?? composerAnchor ?? { x: EDGE, y: 48 }

  const wake = useCallback(() => {
    setSleeping(false)
    if (sleepTimer.current !== null) clearTimeout(sleepTimer.current)
    if (activity.state === 'idle' && !isDrafting) {
      sleepTimer.current = setTimeout(() => { setSleeping(true) }, SLEEP_AFTER_MS)
    }
  }, [activity.state, isDrafting])

  const cancelTeleport = useCallback(() => {
    if (teleportTimer.current !== null) clearTimeout(teleportTimer.current)
    teleportTimer.current = null
    teleportTarget.current = null
    teleportPhaseRef.current = 'idle'
    frozenTeleportCharacterSrc.current = null
    setTeleportPhase('idle')
  }, [])

  const beginTeleport = useCallback((target: CompanionPosition) => {
    teleportTarget.current = target
    if (teleportPhaseRef.current !== 'idle') return

    const run = (): void => {
      frozenTeleportCharacterSrc.current = currentCharacterSrc.current
      teleportPhaseRef.current = 'departing'
      setTeleportPhase('departing')
      teleportTimer.current = setTimeout(() => {
        const destination = teleportTarget.current
        if (destination === null) {
          teleportPhaseRef.current = 'idle'
          setTeleportPhase('idle')
          frozenTeleportCharacterSrc.current = null
          teleportTimer.current = null
          return
        }
        // The frozen character is fully absent at this boundary, so coordinates
        // can switch without exposing a jump or changing the authored scale.
        setRenderedPosition(destination)
        teleportPhaseRef.current = 'arriving'
        setTeleportPhase('arriving')
        teleportTimer.current = setTimeout(() => {
          teleportPhaseRef.current = 'idle'
          setTeleportPhase('idle')
          teleportTimer.current = null
          const latest = teleportTarget.current
          if (latest !== null && positionDistance(latest, destination) >= 0.5) {
            run()
            return
          }
          frozenTeleportCharacterSrc.current = null
        }, COMPANION_DISSOLVE_PHASE_MS)
      }, COMPANION_DISSOLVE_PHASE_MS)
    }

    run()
  }, [])

  useEffect(() => {
    const resize = (): void => {
      setViewportResizing(true)
      setViewport(readViewport())
      setLayoutRevision(value => value + 1)
      if (resizeTimer.current !== null) clearTimeout(resizeTimer.current)
      resizeTimer.current = setTimeout(() => {
        setViewportResizing(false)
        resizeTimer.current = null
      }, 140)
    }
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (resizeTimer.current !== null) clearTimeout(resizeTimer.current)
    }
  }, [])

  useEffect(() => {
    let animationFrame = 0
    let observeUntil = 0
    let previousGeometry = ''
    const measure = (): void => {
      animationFrame = 0
      const composer = visibleRect(document.querySelector('[data-composer-card]'))
      const surfaceState = hasBlockingModal() ? 'modal' : 'available'
      const geometry = composer === null
        ? 'hidden'
        : `${surfaceState}:${Math.round(composer.left)}:${Math.round(composer.right)}:${Math.round(composer.top)}`
      if (geometry !== previousGeometry) {
        previousGeometry = geometry
        setLayoutRevision(value => value + 1)
      }
      if (performance.now() < observeUntil) animationFrame = window.requestAnimationFrame(measure)
    }
    const followLayout = (): void => {
      observeUntil = performance.now() + 1_200
      if (animationFrame === 0) animationFrame = window.requestAnimationFrame(measure)
    }
    const observer = new MutationObserver(followLayout)
    observer.observe(document.body, { childList: true, subtree: true })
    const composer = document.querySelector('[data-composer-card]')
    const resizeObserver = typeof ResizeObserver === 'undefined' || composer === null
      ? null
      : new ResizeObserver(followLayout)
    if (resizeObserver !== null && composer !== null) resizeObserver.observe(composer)
    window.addEventListener('scroll', followLayout, true)
    followLayout()
    return () => {
      observer.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', followLayout, true)
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  useEffect(() => {
    const isComposerInput = (target: EventTarget | null): target is HTMLTextAreaElement => (
      target instanceof HTMLTextAreaElement
      && target.closest('[data-composer-card]') !== null
    )
    const syncDraftState = (target: EventTarget | null): void => {
      if (!isComposerInput(target)) return
      // Deliberately retain only a boolean. Message contents never enter companion state.
      setIsDrafting(target.value.length > 0)
      setLayoutRevision(value => value + 1)
    }
    const onDraftEvent = (event: Event): void => { syncDraftState(event.target) }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (!isComposerInput(event.target)) return
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) setIsDrafting(false)
    }
    const initial = document.querySelector<HTMLTextAreaElement>('[data-composer-card] textarea')
    if (initial !== null) setIsDrafting(initial.value.length > 0)
    document.addEventListener('input', onDraftEvent, true)
    document.addEventListener('focusin', onDraftEvent, true)
    document.addEventListener('focusout', onDraftEvent, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('input', onDraftEvent, true)
      document.removeEventListener('focusin', onDraftEvent, true)
      document.removeEventListener('focusout', onDraftEvent, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  useEffect(() => {
    wake()
    const layoutTimer = window.setTimeout(() => { setLayoutRevision(value => value + 1) }, 180)
    return () => {
      window.clearTimeout(layoutTimer)
      if (sleepTimer.current !== null) clearTimeout(sleepTimer.current)
    }
  }, [activity.latestUpdate, isDrafting, wake])

  useEffect(() => {
    // While the user drags, rendered positions come from the gesture itself;
    // anchor measurements must not schedule a teleport back to the berth.
    if (dragState.current?.moved === true) return
    if (anchorSettleTimer.current !== null) {
      clearTimeout(anchorSettleTimer.current)
      anchorSettleTimer.current = null
    }
    const sessionChanged = previousSession.current !== sessions.current
    previousSession.current = sessions.current
    if (sessionChanged) {
      // A conversation switch often renders a short-lived bottom composer before
      // restoring the real destination. The switch only opens a settling window;
      // it never chooses a destination or starts the transition by itself.
      sessionAnchorSettling.current = true
      cancelTeleport()
    }
    if (composerAnchor === null) {
      previousAnchor.current = null
      sessionAnchorSettling.current = false
      cancelTeleport()
      setRenderedPosition(null)
      return
    }
    const from = previousAnchor.current
    previousAnchor.current = composerAnchor
    if (from === null || viewportResizing) {
      sessionAnchorSettling.current = false
      cancelTeleport()
      teleportTarget.current = composerAnchor
      setRenderedPosition(composerAnchor)
      return
    }

    // A cross-page dissolve owns its coordinates until the character has
    // reformed. Layout changes during that transition only update its final
    // destination; they must not interrupt the material animation.
    if (teleportPhaseRef.current !== 'idle') {
      teleportTarget.current = composerAnchor
      return
    }

    // Inside one conversation the companion is part of the composer chrome,
    // not a separate object travelling to a newly measured point. Adopt every
    // top-edge change directly so textarea growth, attachments and pane reflow
    // keep the character and its controls attached in the same rendered frame.
    if (!sessionAnchorSettling.current) {
      teleportTarget.current = composerAnchor
      setRenderedPosition(composerAnchor)
      return
    }

    const origin = renderedPosition ?? from
    const anchorChanged = positionDistance(composerAnchor, from) >= 0.5
    if (!anchorChanged && !sessionChanged) return
    // Every anchor change during a conversation switch restarts this
    // trailing-edge timer. It deliberately outlives the temporary bottom
    // composer, so only the new page's final position can begin dissolving.
    anchorSettleTimer.current = setTimeout(() => {
      anchorSettleTimer.current = null
      sessionAnchorSettling.current = false
      const stableAnchor = previousAnchor.current
      if (stableAnchor === null) return
      if (positionDistance(stableAnchor, origin) < MIN_TELEPORT_DISTANCE) {
        teleportTarget.current = stableAnchor
        setRenderedPosition(stableAnchor)
        return
      }
      beginTeleport(stableAnchor)
    }, SESSION_ANCHOR_SETTLE_MS)
  }, [
    beginTeleport,
    cancelTeleport,
    composerAnchor?.x,
    composerAnchor?.y,
    renderedPosition?.x,
    renderedPosition?.y,
    sessions.current,
    viewportResizing,
  ])

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
      if (successTimer.current !== null) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => {
        setCelebrating(false)
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
    if (activeTasks.length === 0) closeTasks()
  }, [activeTasks.length, closeTasks])

  const currentWorkSignature = currentSession?.running === true
    ? `${currentSession.id}:${currentSession.updatedAt}`
    : null

  useEffect(() => {
    const previous = previousWorkPulseSignature.current
    previousWorkPulseSignature.current = currentWorkSignature
    if (currentWorkSignature === null || currentWorkSignature === previous) return
    const now = performance.now()
    if (lastWorkPulseAt.current !== null && now - lastWorkPulseAt.current < WORK_PULSE_COOLDOWN_MS) return
    lastWorkPulseAt.current = now
    setWorkPulse(current => ({ revision: current.revision + 1, active: true }))
  }, [currentWorkSignature])

  useEffect(() => {
    if (!tasksOpen) return
    const closeFromOutside = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      closeTasks()
    }
    const closeFromEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') closeTasks()
    }
    document.addEventListener('pointerdown', closeFromOutside, true)
    document.addEventListener('keydown', closeFromEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside, true)
      document.removeEventListener('keydown', closeFromEscape, true)
    }
  }, [closeTasks, tasksOpen])

  useEffect(() => {
    return () => {
      if (teleportTimer.current !== null) clearTimeout(teleportTimer.current)
      if (anchorSettleTimer.current !== null) clearTimeout(anchorSettleTimer.current)
      if (progressTimer.current !== null) clearInterval(progressTimer.current)
      if (progressRevealTimer.current !== null) clearTimeout(progressRevealTimer.current)
      if (clickTimer.current !== null) clearTimeout(clickTimer.current)
      if (clickThroughResetTimer.current !== null) clearTimeout(clickThroughResetTimer.current)
      if (resizeTimer.current !== null) clearTimeout(resizeTimer.current)
      if (taskPanelTimer.current !== null) clearTimeout(taskPanelTimer.current)
    }
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

  const characterState: 'idle' | 'working' | 'waiting' = currentSession !== undefined
    && interactions.get(currentSession.id) !== undefined
    ? 'waiting'
    : currentSession?.running === true
      ? 'working'
      : 'idle'

  const poseState: CompanionVisualState = characterState === 'waiting'
    ? 'waiting'
    : characterState === 'working'
      ? 'working'
      : celebrating
        ? 'success'
        : sleeping
          ? 'sleep'
          : 'idle'

  const semanticTrackName: CompanionTrackName = celebrating
    ? 'success'
    : characterState === 'waiting'
      ? 'waiting'
      : characterState === 'working'
        ? 'focus'
        : sleeping
          ? 'sleep'
          : 'lounge'
  const trackName: CompanionTrackName = teleportPhase === 'idle' ? semanticTrackName : 'dissolve'
  const track = COMPANION_TRACKS[semanticTrackName]
  const animatedTrack = semanticTrackName === 'lounge'
    || (semanticTrackName === 'focus' && workPulse.active)
    || semanticTrackName === 'waiting'
    || semanticTrackName === 'success'
  const frame = animatedTrack ? animatedFrame : track.frames[0] ?? 0
  const frameSrc = companionFrameUrl(skin, track.asset, frame)
  if (teleportPhase === 'idle') currentCharacterSrc.current = frameSrc
  const characterSrc = teleportPhase === 'idle'
    ? frameSrc
    : frozenTeleportCharacterSrc.current ?? currentCharacterSrc.current ?? frameSrc

  const preloadAsset = useCallback((url: string, retain = false) => {
    if (preloadedAssetUrls.current.has(url)) return
    preloadedAssetUrls.current.add(url)
    const image = new Image()
    if (retain) retainedPreloadedAssets.current.set(url, image)
    image.src = url
    const decode = Reflect.get(image, 'decode')
    if (typeof decode === 'function') void Promise.resolve(decode.call(image)).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!visible || composerAnchor === null) return
    preloadAsset(`${ASSET_ROOT}/v13/body-mask-strip.png`, true)
    preloadAsset(`${ASSET_ROOT}/v13/fragment-mask-strip.png`, true)
  }, [composerAnchor, preloadAsset, visible])

  useEffect(() => {
    const count = COMPANION_ASSET_FRAME_COUNTS[track.asset]
    for (const offset of [1, 2]) {
      preloadAsset(companionFrameUrl(skin, track.asset, (frame + offset) % count))
    }
  }, [frame, preloadAsset, skin, track.asset])

  useEffect(() => {
    const stableFrame = track.frames[0] ?? 0
    setAnimatedFrame(stableFrame)
    const sequence = semanticTrackName === 'lounge'
      ? COMPANION_LOUNGE_SEQUENCE
      : semanticTrackName === 'focus' && workPulse.active
        ? COMPANION_FOCUS_SEQUENCE
        : semanticTrackName === 'waiting'
          ? COMPANION_WAITING_SEQUENCE
          : semanticTrackName === 'success'
            ? COMPANION_SUCCESS_SEQUENCE
            : null
    if (sequence === null) return

    const startedAt = performance.now()
    const duration = sequence.reduce((total, step) => total + step.durationMs, 0)
    const loop = semanticTrackName === 'lounge' || semanticTrackName === 'waiting'
    let animationFrame = 0
    const tick = (now: number): void => {
      const nextFrame = companionSequenceFrame(
        sequence,
        now - startedAt,
        loop,
      )
      setAnimatedFrame(current => current === nextFrame ? current : nextFrame)
      if (!loop && now - startedAt >= duration) {
        if (semanticTrackName === 'focus') {
          setWorkPulse(current => current.active && current.revision === workPulse.revision
            ? { ...current, active: false }
            : current)
        }
        return
      }
      animationFrame = window.requestAnimationFrame(tick)
    }
    tick(startedAt)
    return () => { window.cancelAnimationFrame(animationFrame) }
  }, [semanticTrackName, track.frames, workPulse])

  const focusComposer = useCallback(() => {
    document.querySelector<HTMLTextAreaElement>('[data-composer-card] textarea')
      ?.focus({ preventScroll: true })
  }, [])

  const executeAction = useCallback((action: CompanionAction) => {
    setMenuOpen(false)
    closeTasks()
    switch (action) {
      case 'none': return
      case 'focusComposer': focusComposer(); return
      case 'voiceInput': voice.toggle(); return
      // Persisted V7 bindings resolve to the closest current action.
      case 'switchSide': focusComposer(); return
      case 'newSession':
        startSession()
        return
      case 'menu': setMenuOpen(true); return
      case 'close': actions.setVisible(false)
    }
  }, [actions, closeTasks, focusComposer, startSession, voice.toggle])

  const openTask = useCallback((id: SessionId) => {
    openSession(id)
  }, [openSession])

  const onCharacterClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (suppressCharacterClick.current) {
      suppressCharacterClick.current = false
      if (clickThroughResetTimer.current !== null) clearTimeout(clickThroughResetTimer.current)
      clickThroughResetTimer.current = null
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (clickTimer.current !== null) clearTimeout(clickTimer.current)
    if (event.detail >= 2) {
      clickTimer.current = null
      executeAction(doubleClickAction)
      return
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      executeAction(clickAction)
    }, 240)
  }

  /**
   * Track a horizontal drag along the composer card: window-level listeners
   * keep the gesture alive outside the sprite, the 5px threshold separates a
   * drag from a click, and the final ratio commits through the store so every
   * later composer geometry reuses the same relative berth.
   */
  const beginDragTracking = useCallback((down: ReactPointerEvent<HTMLDivElement>) => {
    const state = {
      pointerId: down.pointerId,
      pressX: down.clientX,
      grabOffsetX: down.clientX - position.x,
      moved: false,
      ratio: composerOffsetRatio,
    }
    dragState.current = state
    const detach = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onMove = (event: PointerEvent): void => {
      if (event.pointerId !== state.pointerId || dragState.current !== state) return
      // Belt-and-braces release: if the button is already up (a swallowed
      // pointerup, a lost capture), settle the drag where the cursor is.
      if (event.buttons === 0) {
        finish(true)
        return
      }
      if (!state.moved) {
        if (Math.abs(event.clientX - state.pressX) < DRAG_START_PX) return
        state.moved = true
        setDragging(true)
        cancelTeleport()
      }
      const composer = visibleRect(document.querySelector('[data-composer-card]'))
      if (composer === null) return
      const x = composerXForRatio(
        composerRatioForX(event.clientX - state.grabOffsetX, composer, renderedSize.width),
        composer,
        renderedSize.width,
      )
      state.ratio = composerRatioForX(x, composer, renderedSize.width)
      setRenderedPosition({
        x,
        y: composerYForTop(composer.top, renderedSize.height, renderedSize.bottomInset),
      })
      event.preventDefault()
    }
    const finish = (committed: boolean): void => {
      detach()
      if (dragState.current !== state) return
      dragState.current = null
      if (!state.moved) return
      setDragging(false)
      // A drag is not a click: swallow the synthetic click and the pending
      // click-through so releasing over the composer neither focuses nor submits.
      suppressCharacterClick.current = true
      clickThroughPress.current = null
      if (committed) actions.setComposerOffsetRatio(state.ratio)
      setLayoutRevision(value => value + 1)
    }
    const onUp = (event: PointerEvent): void => {
      if (event.pointerId !== state.pointerId) return
      finish(true)
    }
    const onCancel = (event: PointerEvent): void => {
      if (event.pointerId !== state.pointerId) return
      finish(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }, [actions, cancelTeleport, composerOffsetRatio, position.x, renderedSize])

  const onCharacterPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || rootRef.current === null) return
    beginDragTracking(event)
    const target = underlyingInteractiveTarget(rootRef.current, event.clientX, event.clientY)
    if (target === null) return
    if (clickTimer.current !== null) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    clickThroughPress.current = { pointerId: event.pointerId, target }
    target.focus({ preventScroll: true })
    event.preventDefault()
    event.stopPropagation()
  }

  const onCharacterPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    // A completed drag commits through the window listener; the surface must
    // not also fire the click-through or the click timers on release. Do NOT
    // stop propagation here — that would swallow the window-level pointerup
    // the drag gesture needs to release itself.
    if (dragState.current?.moved === true && dragState.current.pointerId === event.pointerId) {
      return
    }
    const press = clickThroughPress.current
    clickThroughPress.current = null
    if (press === null || press.pointerId !== event.pointerId || rootRef.current === null) return
    const target = underlyingInteractiveTarget(rootRef.current, event.clientX, event.clientY)
    if (target !== press.target) return
    suppressCharacterClick.current = true
    if (clickThroughResetTimer.current !== null) clearTimeout(clickThroughResetTimer.current)
    clickThroughResetTimer.current = setTimeout(() => {
      suppressCharacterClick.current = false
      clickThroughResetTimer.current = null
    }, 0)
    target.focus({ preventScroll: true })
    target.click()
    event.preventDefault()
    event.stopPropagation()
  }

  const cancelCharacterPointer = (): void => {
    clickThroughPress.current = null
  }

  const contextItems: readonly MenuEntry[] = [
    {
      id: 'close',
      label: t('closeAction', { name: displayName }),
    },
  ]
  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    executeAction(contextAction)
  }
  const onCharacterKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    setMenuOpen(true)
  }

  const style = {
    '--companion-x': `${position.x}px`,
    '--companion-y': `${position.y}px`,
    '--companion-width': `${renderedSize.width}px`,
    '--companion-height': `${renderedSize.height}px`,
    '--dissolve-phase-ms': `${COMPANION_DISSOLVE_PHASE_MS}ms`,
  } as CSSProperties
  const activeDuration = elapsedSeconds > 0 ? formatDuration(elapsedSeconds, t) : null
  const completedDuration = lastDurationSeconds === null ? null : formatDuration(lastDurationSeconds, t)
  const focusTask = activeTasks[0] ?? null
  const focusTaskBubble = focusTask === null
    || !showStatus
    || (focusTask.status === 'working' && !progressReady)
    ? null
    : {
      task: focusTask,
      meta: [t(taskStatusKey(focusTask.status)), activeDuration]
        .filter(value => value !== null)
        .join(' · '),
    }
  const completionBubble = showStatus && celebrating
    ? [t('bubble.success'), completedDuration].filter(value => value !== null).join(' · ')
    : null
  const voiceBubble = voice.stage === 'listening'
    ? voice.liveText || t('voice.listening')
    : voice.feedback
  const accessoriesMoving = teleportPhase !== 'idle'
  const liveRatio = dragState.current?.moved === true ? dragState.current.ratio : composerOffsetRatio
  const bubbleAlign = position.x < 58
    ? 'left'
    : position.x > viewport.width - renderedSize.width - 58
      ? 'right'
      : 'center'

  if (!visible || composerAnchor === null) return null

  return (
    <div
      ref={rootRef}
      className={css.root}
      style={style}
      data-product-companion=""
      data-scene={isDrafting ? 'drafting' : displayState}
      data-state={displayState}
      data-pose={poseState}
      data-track={trackName}
      data-asset={track.asset}
      data-frame={frame}
      data-skin={skin}
      data-size={sizePreference}
      data-habitat="composer"
      data-side={liveRatio > 0.5 ? 'right' : 'left'}
      data-dragging={dragging ? 'true' : 'false'}
      data-moving={teleportPhase === 'idle' ? 'false' : 'true'}
      data-motion={teleportPhase === 'idle' ? 'rest' : 'dissolve'}
      data-teleport={teleportPhase}
      data-bubble-align={bubbleAlign}
    >
      {voiceBubble !== null ? (
        <div className={`${css.bubble} ${css.voiceBubble}`} aria-live="polite">
          <span className={css.taskMeta}>{voiceBubble}</span>
        </div>
      ) : tasksMounted ? (
        <div
          className={css.taskPanel}
          data-state={tasksOpen ? 'open' : 'closing'}
          aria-label={t('task.listLabel')}
          aria-hidden={!tasksOpen}
        >
          {activeTasks.map((task, index) => (
            <button
              key={task.id}
              type="button"
              className={css.taskRow}
              data-current={task.current ? 'true' : 'false'}
              tabIndex={tasksOpen ? 0 : -1}
              style={{
                '--task-enter-delay': `${Math.min(4, activeTasks.length - 1 - index) * 34}ms`,
                '--task-exit-delay': `${Math.min(4, index) * 22}ms`,
              } as CSSProperties}
              onPointerDown={(event) => { event.stopPropagation() }}
              onClick={() => { openTask(task.id) }}
            >
              <span className={css.taskTitle}>{task.title}</span>
              <span className={css.taskMeta}>
                {t(taskStatusKey(task.status))}{task.current ? ` · ${t('task.current')}` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : focusTaskBubble !== null ? (
        <button
          type="button"
          className={css.bubble}
          onPointerDown={(event) => { event.stopPropagation() }}
          onClick={() => { openTask(focusTaskBubble.task.id) }}
          aria-label={t('task.open', { title: focusTaskBubble.task.title })}
        >
          <span className={css.taskTitle}>{focusTaskBubble.task.title}</span>
          <span className={css.taskMeta}>{focusTaskBubble.meta}</span>
        </button>
      ) : completionBubble !== null ? (
        <div className={css.bubble} aria-hidden="true">
          <span className={css.taskMeta}>{completionBubble}</span>
        </div>
      ) : null}
      <Menu
        open={menuOpen}
        onClose={() => { setMenuOpen(false) }}
        items={contextItems}
        onSelect={(id) => { executeAction(id as CompanionAction) }}
        align="end"
        side="bottom"
        compact
        className={css.contextMenu ?? ''}
        anchor={(
          <div
            className={css.character}
            data-companion-surface=""
            role="img"
            tabIndex={0}
            aria-label={t('interact', { name: displayName })}
            onPointerDown={onCharacterPointerDown}
            onPointerUp={onCharacterPointerUp}
            onPointerCancel={cancelCharacterPointer}
            onClick={onCharacterClick}
            onContextMenu={openContextMenu}
            onKeyDown={onCharacterKeyDown}
          >
            <span className={css.poseLayer} aria-hidden="true">
              <span className={css.motionLayer}>
                <span className={css.spriteLayer}>
                  {teleportPhase === 'idle' ? (
                    <img
                      className={css.characterImage}
                      src={characterSrc}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <span className={css.materialDissolveLayer} aria-hidden="true">
                      <img
                        className={`${css.characterImage} ${css.materialBody}`}
                        src={characterSrc}
                        style={maskStripStyle('body')}
                        alt=""
                        draggable={false}
                      />
                      <img
                        className={`${css.characterImage} ${css.materialFragments}`}
                        src={characterSrc}
                        style={maskStripStyle('fragment')}
                        alt=""
                        draggable={false}
                      />
                    </span>
                  )}
                </span>
              </span>
            </span>
          </div>
        )}
      />
      <div
        className={css.quickControls}
        data-companion-accessories=""
        data-phase={teleportPhase}
        aria-hidden={accessoriesMoving || undefined}
        onPointerDown={(event) => { event.stopPropagation() }}
      >
        {voiceEnabled ? (
          <button
            type="button"
            className={css.quickControl}
            data-control="voice"
            data-active={voice.stage === 'listening' ? 'true' : 'false'}
            disabled={accessoriesMoving || !voice.supported}
            aria-pressed={voice.stage === 'listening'}
            aria-label={voice.stage === 'listening'
              ? t('voice.stop')
              : voice.supported ? t('voice.start') : t('voice.unsupported')}
            onClick={voice.toggle}
          >
            <span className={css.voiceIcon} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className={css.quickControl}
          disabled={accessoriesMoving || !showStatus || activeTasks.length === 0}
          aria-expanded={tasksOpen}
          aria-label={tasksOpen
            ? t('task.collapse', { count: activeTasks.length })
            : t('task.expand', { count: activeTasks.length })}
          title={activeTasks.length === 0 ? t('task.none') : t('task.count', { count: activeTasks.length })}
          onClick={toggleTasks}
        >
          <span className={css.taskCount}>{activeTasks.length}</span>
        </button>
      </div>
      <span className={css.srOnly} aria-live="polite">{t(stateKey(displayState))}</span>
    </div>
  )
}

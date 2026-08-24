import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { deriveCompanionActivity, deriveCompanionTasks, type CompanionTask } from './activity.ts'
import type { CompanionLocaleKey } from './locales.ts'
import {
  COMPANION_ASSET_CLIPS, COMPANION_ASSET_FRAME_COUNTS,
  COMPANION_FOCUS_SEQUENCE,
  COMPANION_LOUNGE_SEQUENCE, COMPANION_SUCCESS_SEQUENCE,
  COMPANION_PORTAL_ARRIVAL_SEQUENCE, COMPANION_PORTAL_DEPARTURE_SEQUENCE,
  COMPANION_PORTAL_PHASE_MS, COMPANION_TRACKS, COMPANION_WAITING_SEQUENCE,
  companionSequenceFrame,
  type CompanionAssetClip, type CompanionTrackName,
} from './animation.ts'
import {
  createCompanionStore,
  DEFAULT_COMPANION_NAME, DEFAULT_VOICE_INSTRUCTION, DEFAULT_VOICE_SHORTCUT,
  type CompanionAction, type CompanionPosition, type CompanionSize, type CompanionSkin,
} from './store.ts'
import { useVoiceInput } from './voice-input.ts'
import css from './ProductCompanion.module.css'

export type CompanionVisualState = 'idle' | 'working' | 'waiting' | 'success' | 'sleep'

type ProductCompanionProps =
  PropsRuntime<'shell.overlay'>
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
const ANCHOR_SETTLE_MS = 120
const SESSION_ANCHOR_SETTLE_MS = 360
const MIN_TELEPORT_DISTANCE = 6
const ASSET_ROOT = '/plugins/ui-product-companion/assets'

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

/** Measure the stable right edge of the real composer without covering its controls. */
function measureComposerAnchor(viewport: Viewport, preference: CompanionSize): CompanionPosition | null {
  const composer = visibleRect(document.querySelector('[data-composer-card]'))
  // Only a true modal owns the whole product surface. Header popovers such as
  // Model Usage also use dialog semantics, but must not unmount an independent
  // shell-overlay plugin merely because their panel is open.
  if (hasBlockingModal() || composer === null) return null
  const size = companionSize(viewport, preference)
  // The authored lounge silhouette ends above the transparent canvas edge.
  // This offset makes the visible body touch the composer border without covering its text.
  const y = composer.top - size.height + size.bottomInset
  return clampPosition({ x: composer.right - size.width - 14, y }, viewport, preference)
}

/** Public and testable frame URL contract. */
export function companionFrameUrl(
  skin: CompanionSkin,
  clip: CompanionAssetClip,
  frame = 0,
): string {
  const bounded = Math.max(0, Math.min(COMPANION_ASSET_FRAME_COUNTS[clip] - 1, Math.floor(frame)))
  return `${ASSET_ROOT}/v8/${skin}-${clip}-${String(bounded + 1).padStart(2, '0')}.png`
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
}

/** Global product companion, mounted once above all app columns. */
export function ProductCompanion({
  useSessions, useStore, actions, startSession = () => undefined,
  openSession = () => undefined, t,
}: ProductCompanionProps) {
  const sessions = useSessions(snapshot => snapshot)
  const activity = useMemo(() => deriveCompanionActivity(sessions), [sessions])
  const activeTasks = useMemo(() => deriveCompanionTasks(sessions), [sessions])
  const skin = useStore(state => state.skin)
  const displayName = useStore(state => state.displayName?.trim() || DEFAULT_COMPANION_NAME)
  const visible = useStore(state => state.visible ?? true)
  const sizePreference = useStore(state => state.size ?? 'large')
  const clickAction = useStore(state => state.clickAction ?? 'focusComposer')
  const doubleClickAction = useStore(state => state.doubleClickAction ?? 'newSession')
  const contextAction = useStore(state => state.contextAction ?? 'menu')
  const showStatus = useStore(state => state.showStatus)
  const voiceEnabled = useStore(state => state.voiceEnabled ?? true)
  const voiceProcessing = useStore(state => state.voiceProcessing ?? true)
  const voiceProvider = useStore(state => state.voiceProvider ?? '')
  const voiceModel = useStore(state => state.voiceModel ?? '')
  const voiceInstruction = useStore(state => state.voiceInstruction ?? DEFAULT_VOICE_INSTRUCTION)
  const voiceShortcut = useStore(state => state.voiceShortcut ?? DEFAULT_VOICE_SHORTCUT)
  const voicePreferences = useMemo(() => ({
    enabled: voiceEnabled,
    processText: voiceProcessing,
    provider: voiceProvider,
    model: voiceModel,
    instruction: voiceInstruction,
    shortcut: voiceShortcut,
  }), [voiceEnabled, voiceInstruction, voiceModel, voiceProcessing, voiceProvider, voiceShortcut])
  const recordVoiceUsage = useCallback((
    spokenSeconds: number,
    processedChars: number,
    estimatedSavedSeconds: number,
  ) => {
    actions.recordVoiceUsage(spokenSeconds, processedChars, estimatedSavedSeconds)
  }, [actions])
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
  const rootRef = useRef<HTMLDivElement>(null)
  const previousRunning = useRef(0)
  const runStartedAt = useRef<number | null>(null)
  const previousSession = useRef(sessions.current)
  const sessionAnchorSettling = useRef(false)
  const previousAnchor = useRef<CompanionPosition | null>(null)
  const teleportTarget = useRef<CompanionPosition | null>(null)
  const teleportPhaseRef = useRef<TeleportPhase>('idle')
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const teleportTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const taskPanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voice = useVoiceInput({
    preferences: voicePreferences,
    recordUsage: recordVoiceUsage,
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
    () => measureComposerAnchor(viewport, sizePreference),
    [viewport, layoutRevision, sizePreference],
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
    setTeleportPhase('idle')
  }, [])

  const beginTeleport = useCallback((target: CompanionPosition) => {
    teleportTarget.current = target
    if (teleportPhaseRef.current !== 'idle') return

    const run = (): void => {
      teleportPhaseRef.current = 'departing'
      setTeleportPhase('departing')
      teleportTimer.current = setTimeout(() => {
        const destination = teleportTarget.current
        if (destination === null) {
          teleportPhaseRef.current = 'idle'
          setTeleportPhase('idle')
          teleportTimer.current = null
          return
        }
        // Frame twelve contains only the closed doorway, so the root can switch
        // coordinates here without exposing a crawling or scaling transition.
        setRenderedPosition(destination)
        teleportPhaseRef.current = 'arriving'
        setTeleportPhase('arriving')
        teleportTimer.current = setTimeout(() => {
          teleportPhaseRef.current = 'idle'
          setTeleportPhase('idle')
          teleportTimer.current = null
          const latest = teleportTarget.current
          if (latest !== null && positionDistance(latest, destination) >= 0.5) run()
        }, COMPANION_PORTAL_PHASE_MS)
      }, COMPANION_PORTAL_PHASE_MS)
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
    for (const clip of COMPANION_ASSET_CLIPS) {
      for (let frame = 0; frame < COMPANION_ASSET_FRAME_COUNTS[clip]; frame += 1) {
        const image = new Image()
        image.src = companionFrameUrl(skin, clip, frame)
        const decode = Reflect.get(image, 'decode')
        if (typeof decode === 'function') {
          void Promise.resolve(decode.call(image)).catch(() => undefined)
        }
      }
    }
  }, [skin])

  useEffect(() => {
    wake()
    const layoutTimer = window.setTimeout(() => { setLayoutRevision(value => value + 1) }, 180)
    return () => {
      window.clearTimeout(layoutTimer)
      if (sleepTimer.current !== null) clearTimeout(sleepTimer.current)
    }
  }, [activity.latestUpdate, isDrafting, wake])

  useEffect(() => {
    if (anchorSettleTimer.current !== null) {
      clearTimeout(anchorSettleTimer.current)
      anchorSettleTimer.current = null
    }
    const sessionChanged = previousSession.current !== sessions.current
    previousSession.current = sessions.current
    if (sessionChanged) {
      // A conversation switch often renders a short-lived bottom composer before
      // restoring the real destination. The switch only opens a settling window;
      // it never chooses a destination or starts the portal by itself.
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
    const origin = renderedPosition ?? from
    const anchorChanged = positionDistance(composerAnchor, from) >= 0.5
    if (!anchorChanged && !sessionChanged) return
    const settleDelay = sessionAnchorSettling.current
      ? SESSION_ANCHOR_SETTLE_MS
      : ANCHOR_SETTLE_MS
    // Every measured anchor change restarts this trailing-edge timer. During a
    // conversation switch this deliberately outlives the temporary bottom
    // composer, so only the final visible position can open the doorway.
    anchorSettleTimer.current = setTimeout(() => {
      anchorSettleTimer.current = null
      sessionAnchorSettling.current = false
      const stableAnchor = previousAnchor.current
      if (stableAnchor === null) return
      if (positionDistance(stableAnchor, origin) < MIN_TELEPORT_DISTANCE) return
      beginTeleport(stableAnchor)
    }, settleDelay)
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

  const poseState: CompanionVisualState = activity.state === 'waiting'
    ? 'waiting'
    : activity.state === 'working'
      ? 'working'
      : celebrating
        ? 'success'
        : sleeping
          ? 'sleep'
          : 'idle'

  const trackName: CompanionTrackName = teleportPhase !== 'idle'
    ? 'portal'
    : voice.stage === 'processing'
      ? 'focus'
      : voice.stage === 'listening'
        ? 'waiting'
        : celebrating
          ? 'success'
          : activity.state === 'waiting'
            ? 'waiting'
            : activity.state === 'working'
              ? 'focus'
              : sleeping
                ? 'sleep'
                : 'lounge'
  const track = COMPANION_TRACKS[trackName]
  const animatedTrack = trackName === 'lounge'
    || trackName === 'portal'
    || trackName === 'focus'
    || trackName === 'waiting'
    || trackName === 'success'
  const frame = animatedTrack ? animatedFrame : track.frames[0] ?? 0
  const frameSrc = companionFrameUrl(skin, track.asset, frame)

  useEffect(() => {
    const stableFrame = track.frames[0] ?? 0
    setAnimatedFrame(stableFrame)
    const sequence = trackName === 'lounge'
      ? COMPANION_LOUNGE_SEQUENCE
      : trackName === 'portal'
        ? teleportPhase === 'arriving'
          ? COMPANION_PORTAL_ARRIVAL_SEQUENCE
          : COMPANION_PORTAL_DEPARTURE_SEQUENCE
        : trackName === 'focus'
          ? COMPANION_FOCUS_SEQUENCE
          : trackName === 'waiting'
            ? COMPANION_WAITING_SEQUENCE
            : trackName === 'success'
              ? COMPANION_SUCCESS_SEQUENCE
              : null
    if (sequence === null) return

    const startedAt = performance.now()
    let animationFrame = 0
    const tick = (now: number): void => {
      const nextFrame = companionSequenceFrame(
        sequence,
        now - startedAt,
        trackName !== 'success' && trackName !== 'portal',
      )
      setAnimatedFrame(current => current === nextFrame ? current : nextFrame)
      animationFrame = window.requestAnimationFrame(tick)
    }
    tick(startedAt)
    return () => { window.cancelAnimationFrame(animationFrame) }
  }, [teleportPhase, track.frames, trackName])

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
    : voice.stage === 'processing'
      ? t('voice.processing')
      : voice.feedback
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
      data-side="right"
      data-moving={teleportPhase === 'idle' ? 'false' : 'true'}
      data-motion={teleportPhase === 'idle' ? 'rest' : 'portal'}
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
            onClick={onCharacterClick}
            onContextMenu={openContextMenu}
            onKeyDown={onCharacterKeyDown}
          >
            <span className={css.poseLayer} aria-hidden="true">
              <span className={css.motionLayer}>
                <span className={css.spriteLayer}>
                  <img
                    className={css.characterImage}
                    src={frameSrc}
                    alt=""
                    draggable={false}
                  />
                </span>
              </span>
            </span>
          </div>
        )}
      />
      <div className={css.quickControls} onPointerDown={(event) => { event.stopPropagation() }}>
        {voiceEnabled ? (
          <button
            type="button"
            className={css.quickControl}
            data-active={voice.stage === 'listening' || voice.stage === 'processing' ? 'true' : 'false'}
            disabled={!voice.supported || voice.stage === 'processing'}
            aria-pressed={voice.stage === 'listening'}
            aria-label={voice.stage === 'listening'
              ? t('voice.stop')
              : voice.stage === 'processing'
                ? t('voice.processing')
                : voice.supported ? t('voice.start') : t('voice.unsupported')}
            title={voice.supported ? t('voice.shortcutHint', { shortcut: voiceShortcut }) : t('voice.unsupported')}
            onClick={voice.toggle}
          >
            <span className={css.voiceIcon} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className={css.quickControl}
          disabled={!showStatus || activeTasks.length === 0}
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

export type CompanionAssetClip = 'lounge' | 'portal' | 'focus' | 'waiting' | 'success'
export type CompanionTrackName =
  | 'lounge'
  | 'portal'
  | 'focus'
  | 'waiting'
  | 'success'
  | 'sleep'

export interface CompanionTrack {
  asset: CompanionAssetClip
  frames: readonly number[]
}

export interface CompanionFrameStep {
  frame: number
  durationMs: number
}

/**
 * Drawings use a 24 fps exposure sheet while the browser moves the complete
 * character on its display refresh loop. Quiet acting stays on twos or threes;
 * semantic loops expose their authored drawings on twos or threes.
 */
export const COMPANION_ANIMATION_FPS = 24
export const COMPANION_FRAME_TICK_MS = 1_000 / COMPANION_ANIMATION_FPS

function exposure(frame: number, ticks = 2): CompanionFrameStep {
  return { frame, durationMs: COMPANION_FRAME_TICK_MS * ticks }
}

/** The persistent prone breathing loop above the composer. */
export const COMPANION_LOUNGE_SEQUENCE: readonly CompanionFrameStep[] =
  Array.from({ length: 20 }, (_, frame) => exposure(frame, frame % 5 === 0 ? 3 : 2))

/** Rise in the same close camera, open the doorway, and disappear without zooming out. */
export const COMPANION_PORTAL_DEPARTURE_SEQUENCE: readonly CompanionFrameStep[] = [
  exposure(0, 2),
  ...Array.from({ length: 10 }, (_, index) => exposure(index + 1, 1)),
  exposure(11, 2),
]

/** Re-enter through the same doorway by reversing the accepted drawings. */
export const COMPANION_PORTAL_ARRIVAL_SEQUENCE: readonly CompanionFrameStep[] =
  COMPANION_PORTAL_DEPARTURE_SEQUENCE.toReversed()

export const COMPANION_PORTAL_PHASE_MS = COMPANION_PORTAL_DEPARTURE_SEQUENCE
  .reduce((total, step) => total + step.durationMs, 0)

/** Prone Agent-work loop with a small DeepSeek whale data pulse. */
export const COMPANION_FOCUS_SEQUENCE: readonly CompanionFrameStep[] =
  Array.from({ length: 12 }, (_, frame) => exposure(frame, frame === 0 || frame === 11 ? 3 : 2))

/** Prone attention loop used when the Agent needs the user. */
export const COMPANION_WAITING_SEQUENCE: readonly CompanionFrameStep[] =
  Array.from({ length: 12 }, (_, frame) => exposure(frame, frame === 0 || frame === 11 ? 3 : 2))

/** One prone wave and whale sparkle after a real task completes. */
export const COMPANION_SUCCESS_SEQUENCE: readonly CompanionFrameStep[] =
  Array.from({ length: 12 }, (_, frame) => exposure(frame, frame === 0 || frame === 11 ? 3 : 2))

export const COMPANION_SUCCESS_DURATION_MS = COMPANION_SUCCESS_SEQUENCE
  .reduce((total, step) => total + step.durationMs, 0)

export function companionSequenceFrame(
  sequence: readonly CompanionFrameStep[],
  elapsedMs: number,
  loop = true,
): number {
  const duration = sequence.reduce((total, step) => total + step.durationMs, 0)
  if (duration <= 0 || sequence.length === 0) return 0
  let cursor = loop
    ? Math.max(0, elapsedMs) % duration
    : Math.min(Math.max(0, elapsedMs), Math.max(0, duration - 1))
  for (const step of sequence) {
    if (cursor < step.durationMs) return step.frame
    cursor -= step.durationMs
  }
  return sequence[0]?.frame ?? 0
}

/** Semantic states stay prone; geometry changes temporarily use the locked portal camera. */
export const COMPANION_TRACKS: Readonly<Record<CompanionTrackName, CompanionTrack>> = {
  lounge: {
    asset: 'lounge',
    frames: COMPANION_LOUNGE_SEQUENCE.map(step => step.frame),
  },
  portal: {
    asset: 'portal',
    frames: COMPANION_PORTAL_DEPARTURE_SEQUENCE.map(step => step.frame),
  },
  focus: {
    asset: 'focus',
    frames: COMPANION_FOCUS_SEQUENCE.map(step => step.frame),
  },
  waiting: {
    asset: 'waiting',
    frames: COMPANION_WAITING_SEQUENCE.map(step => step.frame),
  },
  success: {
    asset: 'success',
    frames: COMPANION_SUCCESS_SEQUENCE.map(step => step.frame),
  },
  sleep: {
    asset: 'lounge',
    frames: [15],
  },
}

export const COMPANION_ASSET_CLIPS: readonly CompanionAssetClip[] = [
  'lounge', 'portal', 'focus', 'waiting', 'success',
]
export const COMPANION_ASSET_FRAME_COUNTS: Readonly<Record<CompanionAssetClip, number>> = {
  lounge: 20,
  portal: 12,
  focus: 12,
  waiting: 12,
  success: 12,
}

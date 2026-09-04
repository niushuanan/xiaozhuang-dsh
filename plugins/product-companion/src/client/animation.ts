export type CompanionAssetClip = 'lounge' | 'portal' | 'focus' | 'waiting' | 'success'
export type CompanionTrackName =
  | 'lounge'
  | 'dissolve'
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

/**
 * Relocation keeps one authored character image at one fixed scale. Forty-eight
 * silhouette-derived material masks release that same bitmap from the outer
 * body edges into progressively smaller source-colored fragments; arrival
 * reverses the exact sequence. No independent foam or replacement character.
 */
export const COMPANION_DISSOLVE_PHASE_MS = 1_040
export const COMPANION_DISSOLVE_FRAME_COUNT = 48
export const COMPANION_DISSOLVE_FRAME_CROSSFADE_MS = 28

export function companionDissolveFrame(elapsedMs: number, reverse = false): number {
  const progress = Math.min(0.999_999, Math.max(0, elapsedMs) / COMPANION_DISSOLVE_PHASE_MS)
  const forward = Math.min(
    COMPANION_DISSOLVE_FRAME_COUNT - 1,
    Math.floor(progress * COMPANION_DISSOLVE_FRAME_COUNT),
  )
  return reverse ? COMPANION_DISSOLVE_FRAME_COUNT - 1 - forward : forward
}

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

/** Semantic states stay prone; geometry changes temporarily use body-material dissolution. */
export const COMPANION_TRACKS: Readonly<Record<CompanionTrackName, CompanionTrack>> = {
  lounge: {
    asset: 'lounge',
    frames: COMPANION_LOUNGE_SEQUENCE.map(step => step.frame),
  },
  dissolve: {
    asset: 'lounge',
    frames: [0],
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
  'lounge', 'focus', 'waiting', 'success',
]
export const COMPANION_ASSET_FRAME_COUNTS: Readonly<Record<CompanionAssetClip, number>> = {
  lounge: 20,
  portal: 12,
  focus: 12,
  waiting: 12,
  success: 12,
}

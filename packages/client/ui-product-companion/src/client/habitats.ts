import type { CompanionHabitat, CompanionPosition } from './store.ts'

export interface HabitatAnchors {
  sidebar: CompanionPosition
  header: CompanionPosition | null
  composer: CompanionPosition | null
}

const SNAP_DISTANCE = 118

function distance(a: CompanionPosition, b: CompanionPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Resolve a semantic home to the closest available product surface. */
export function resolveHabitat(
  habitat: CompanionHabitat,
  anchors: HabitatAnchors,
): Exclude<CompanionHabitat, 'free'> {
  if (habitat === 'composer' && anchors.composer !== null) return 'composer'
  if (habitat === 'header' && anchors.header !== null) return 'header'
  return 'sidebar'
}

/** Snap a dropped character to a nearby real surface; otherwise keep it free. */
export function nearestHabitat(
  position: CompanionPosition,
  anchors: HabitatAnchors,
): CompanionHabitat {
  const candidates: Array<[Exclude<CompanionHabitat, 'free'>, CompanionPosition]> = [
    ['sidebar', anchors.sidebar],
  ]
  if (anchors.header !== null) candidates.push(['header', anchors.header])
  if (anchors.composer !== null) candidates.push(['composer', anchors.composer])
  const nearest = candidates
    .map(([habitat, anchor]) => ({ habitat, distance: distance(position, anchor) }))
    .sort((a, b) => a.distance - b.distance)[0]
  return nearest !== undefined && nearest.distance <= SNAP_DISTANCE ? nearest.habitat : 'free'
}

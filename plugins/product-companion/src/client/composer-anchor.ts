/** Horizontal geometry that pins the companion to the composer card. */

export interface ComposerRect {
  readonly left: number
  readonly width: number
}

/** Side insets keep the silhouette off the card's rounded corners. */
export const COMPOSER_LEFT_INSET = 6
export const COMPOSER_RIGHT_INSET = 14

/**
 * Map a persisted 0–1 offset ratio to the companion's left edge: 0 hugs the
 * composer's left inset, 1 the right inset (the historical default berth).
 * A card narrower than the character parks at the left inset.
 *
 * @param ratio - Persisted horizontal offset as a 0–1 fraction of usable width.
 * @param composer - Visible composer card rectangle.
 * @param petWidth - Rendered companion width in pixels.
 * @returns The companion's left edge in viewport pixels.
 */
export function composerXForRatio(
  ratio: number,
  composer: ComposerRect,
  petWidth: number,
): number {
  const usable = composer.width - COMPOSER_LEFT_INSET - COMPOSER_RIGHT_INSET - petWidth
  if (usable <= 0) return composer.left + COMPOSER_LEFT_INSET
  const bounded = Math.max(0, Math.min(1, ratio))
  return composer.left + COMPOSER_LEFT_INSET + bounded * usable
}

/**
 * Inverse of {@link composerXForRatio}: derive the persisted ratio from a left
 * edge the user dragged to, clamped into the usable span.
 *
 * @param x - Proposed companion left edge in viewport pixels.
 * @param composer - Visible composer card rectangle.
 * @param petWidth - Rendered companion width in pixels.
 * @returns The clamped 0–1 offset ratio to persist.
 */
export function composerRatioForX(
  x: number,
  composer: ComposerRect,
  petWidth: number,
): number {
  const usable = composer.width - COMPOSER_LEFT_INSET - COMPOSER_RIGHT_INSET - petWidth
  if (usable <= 0) return 1
  const bounded = Math.max(
    composer.left + COMPOSER_LEFT_INSET,
    Math.min(x, composer.left + COMPOSER_LEFT_INSET + usable),
  )
  return (bounded - composer.left - COMPOSER_LEFT_INSET) / usable
}

/**
 * Keep the authored lounge silhouette touching the composer's top border
 * without covering its text.
 *
 * @param top - Composer card top edge in viewport pixels.
 * @param petHeight - Rendered companion height in pixels.
 * @param bottomInset - Authored overlap of the transparent canvas edge.
 * @returns The companion's top edge in viewport pixels.
 */
export function composerYForTop(top: number, petHeight: number, bottomInset: number): number {
  return top - petHeight + bottomInset
}

/** Package-owned invariant companion for the product companion plugin. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-product-companion'

/** Cordis companion plugin name. */
export const name = 'client-ui-product-companion-invariant'
/** Service required before reserving package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the overlay owns one effect-scoped slot entry and its
 * persisted root store is governed by the shared client runtime.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

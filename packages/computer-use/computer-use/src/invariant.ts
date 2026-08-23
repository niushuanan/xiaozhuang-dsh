/** Package-owned invariant companion. @module @deepseek-ai/dsh-computer-use/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-computer-use'

/** Cordis companion plugin name. */
export const name = 'computer-use-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Runtime isolation and bridge authentication are enforced at their owning boundaries. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

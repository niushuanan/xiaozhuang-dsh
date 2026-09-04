import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-selection-actions'
export const name = 'client-ui-selection-actions-invariant'
export const inject = ['invariants']
/** No runtime invariant: the overlay is effect-scoped and quote serialization is covered by package tests. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

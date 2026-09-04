import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-plugin-catalog'
export const name = 'client-ui-plugin-catalog-invariant'
export const inject = ['invariants']

// No runtime invariant: the host endpoint and client selection controller own
// their state directly and are covered by package contract tests.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

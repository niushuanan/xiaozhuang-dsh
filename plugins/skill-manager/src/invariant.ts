import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-skill-manager'
export const name = 'client-ui-skill-manager-invariant'
export const inject = ['invariants']

// No runtime invariant: the Host endpoint and Client page own no state beyond
// one request or component lifetime; package tests cover their observable results.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

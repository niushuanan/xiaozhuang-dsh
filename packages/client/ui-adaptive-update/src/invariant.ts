/** Package-owned invariant companion for the native adaptive updater. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-adaptive-update'
export const name = 'client-ui-adaptive-update-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

/** Reserve native-updater package ownership in the invariant registry. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

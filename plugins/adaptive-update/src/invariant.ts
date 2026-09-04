/** Package-owned invariant companion for native continuous adaptation. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-adaptive-update'
export const name = 'client-ui-adaptive-update-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: the updater contributes no session events and owns no
 * in-process service state; every durable fact lives in the repository refs
 * and the on-disk candidate directory, not in a runtime event stream.
 */
const install: InvariantInstaller = () => {}

/** Reserve native-updater package ownership in the invariant registry. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

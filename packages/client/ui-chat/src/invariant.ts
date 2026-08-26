/** Package-owned invariant companion for native Chat. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-chat'
export const name = 'client-ui-chat-invariant'
export const inject = ['invariants']
// No runtime invariant: Chat owns gesture orchestration with no shared mutable
// Cordis state; focused tests assert reuse and in-flight creation ownership.
const install: InvariantInstaller = () => {}

/** Reserve package ownership for the lifetime of the composition. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

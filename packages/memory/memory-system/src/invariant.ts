/** Package-owned invariant companion for the native memory system. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-memory-system'

export const name = 'memory-system-invariant'
export const inject = ['invariants']

/** No runtime invariant: fixed-path persistence and prompt framing are covered by package tests. */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

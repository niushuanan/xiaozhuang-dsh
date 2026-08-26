import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as ChatInvariant from '../src/invariant.ts'

describe('ui-chat invariant companion', () => {
  it('reserves the package name for the mounted composition', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(ChatInvariant).await()).resolves.toBeDefined()
  })
})

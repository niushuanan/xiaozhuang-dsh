import type { ClientContext } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ComposerAddMenu } from './ComposerAddMenu.tsx'

export { ComposerAddMenu } from './ComposerAddMenu.tsx'

export const inject = ['slots']

/** Occupy the native composer add seat with the unified one-layer directory. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.add', () => ctx.slots.register({
    name: 'conversation.input.add',
    priority: -10,
  }, ComposerAddMenu))
}

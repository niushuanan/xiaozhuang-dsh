/**
 * Queue edit semantics on the host ApiProxy: the wire carries text only, and
 * a mixed-content queued row keeps its non-text blocks verbatim while the
 * replacement text takes over the text position.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, MessageId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '../src/api-proxy.ts'

const sid = (id: string): SessionId => id as SessionId

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`queue-edit-${String(nextRpc++)}`), payload }
}

async function harness(
  queuedContent: ReadonlyArray<Record<string, unknown>>,
  itemId: string,
): Promise<{
  api: ReturnType<typeof createApiProxy>
  sessionId: SessionId
  replace: ReturnType<typeof vi.fn>
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  const session = ctx.sessions.create(sid(`session-queue-edit-${String(nextRpc++)}`), { meta: { cwd: '/proj' } })
  const queued = {
    ...createUserMessage({
      content: queuedContent as never,
      source: { kind: 'user' as const },
    }),
    id: MessageId(itemId),
  }
  const replace = vi.fn(() => true)
  const agent = {
    id: session.id,
    session,
    status: 'idle',
    ctx,
    inbox: { nextTurn: [queued], nextStep: [], replace },
  } as unknown as Agent
  ctx.agents.register(agent)
  const api = createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })
  return { api, sessionId: session.id, replace }
}

describe('sessions.updateQueue edit semantics', () => {
  it('keeps image blocks verbatim and replaces only the text of a mixed row', async () => {
    const { api, sessionId, replace } = await harness([
      { type: 'image', mediaType: 'image/png', data: 'aGVsbG8=' },
      { type: 'text', text: '原始文字' },
    ], 'queued-item')

    const response = await api.sessions.updateQueue(request({
      sessionId,
      itemId: MessageId('queued-item'),
      action: { kind: 'edit', content: [{ type: 'text', text: '改好的文字' }] },
    }))
    expect(response.result.ok).toBe(true)
    expect(replace).toHaveBeenCalledTimes(1)
    const replaced = replace.mock.calls[0]?.[1] as { content: Array<{ type: string; text?: string; data?: string }> }
    // The image rides along untouched; the text is the edited one.
    expect(replaced.content).toEqual([
      { type: 'image', mediaType: 'image/png', data: 'aGVsbG8=' },
      { type: 'text', text: '改好的文字' },
    ])
  })

  it('keeps pure-text replacement unchanged for text-only rows', async () => {
    const { api, sessionId, replace } = await harness([
      { type: 'text', text: '之前' },
    ], 'queued-text')

    const response = await api.sessions.updateQueue(request({
      sessionId,
      itemId: MessageId('queued-text'),
      action: { kind: 'edit', content: [{ type: 'text', text: '之后' }] },
    }))
    expect(response.result.ok).toBe(true)
    const replaced = replace.mock.calls[0]?.[1] as { content: Array<{ type: string; text?: string }> }
    expect(replaced.content).toEqual([{ type: 'text', text: '之后' }])
  })

  it('still rejects non-text edit payloads on the wire', async () => {
    const { api, sessionId, replace } = await harness([], 'queued-item')

    const response = await api.sessions.updateQueue(request({
      sessionId,
      itemId: MessageId('queued-item'),
      action: {
        kind: 'edit',
        content: [{ type: 'image', mediaType: 'image/png', data: 'aGVsbG8=' }] as never,
      },
    }))
    expect(response.result.ok).toBe(false)
    if (!response.result.ok) expect(response.result.error.code).toBe('attachment-error')
    expect(replace).not.toHaveBeenCalled()
  })
})

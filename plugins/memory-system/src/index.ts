/** Native Host half of DSH's global two-document memory system. */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session-query'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { MEMORY_API_ROUTE, memoryApiHandler, type MemoryApiService } from './api.ts'
import { memoryContextFor, redactSensitiveText } from './domain.ts'
import { maintainMemoryDocument } from './maintenance.ts'
import { generateMemoryWithLlm, PLUGIN_AI_ROUTE } from './model.ts'
import { IdleMemoryScheduler } from './scheduler.ts'
import { MemoryDocumentStore, type MemoryDocumentKind } from './store.ts'
import { injectMemoryContext } from './recall.ts'
import type { MaintenanceOutcome, SelectionMemorySource } from './types.ts'

export { MEMORY_API_ROUTE } from './api.ts'
export { MemoryDocumentStore } from './store.ts'

export const name = 'memory-system'
export const inject = ['webServer', 'llm', 'sessionQuery', 'agents']

/** Deployment-tunable automatic-memory timing, changeable from cordis.yml. */
export interface Config {
  /** Quiet span a conversation must reach before its new evidence is curated into `ai.md`. */
  readonly idleDelayMs: number
}

/** Runtime schema for {@link Config}. */
export const Config = z.object({
  idleDelayMs: z.number().min(60_000).max(3_600_000).default(300_000),
}) as unknown as z<Config>

function directText(messages: readonly UserMessage[]): string {
  return messages
    .filter(message => message.source.kind === 'user')
    .flatMap(message => message.content)
    .filter((block): block is Extract<(typeof messages)[number]['content'][number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

class NativeMemoryService implements MemoryApiService {
  constructor(
    private readonly ctx: Context,
    private readonly store: MemoryDocumentStore,
    private readonly scheduler: IdleMemoryScheduler,
  ) {}

  async documents() {
    const [user, ai, state] = await Promise.all([
      this.store.read('user'), this.store.read('ai'), this.store.readState(),
    ])
    return { user, ai, state }
  }

  write(kind: MemoryDocumentKind, content: string, revision: string) {
    return this.store.write(kind, content, revision, 'user-edit')
  }

  restore(kind: MemoryDocumentKind, revision: string) {
    return this.store.restorePrevious(kind, revision)
  }

  maintain(): Promise<MaintenanceOutcome> {
    return this.scheduler.organizeNow()
  }

  async remember(source: SelectionMemorySource, signal?: AbortSignal) {
    const agent = this.ctx.agents.get(SessionId(source.sessionId))
    if (agent === undefined) throw new Error('the source conversation is not currently available')
    const route = PLUGIN_AI_ROUTE
    const safeSource: SelectionMemorySource = {
      ...source,
      selectedText: redactSensitiveText(source.selectedText),
      context: redactSensitiveText(source.context),
    }
    const result = await maintainMemoryDocument({
      store: this.store,
      kind: 'user',
      source: safeSource,
      route,
      sessionId: agent.id,
      ...signal === undefined ? {} : { signal },
      generate: args => generateMemoryWithLlm(this.ctx, args.request, {
        ...args.sessionId === undefined ? {} : { sessionId: args.sessionId },
        ...args.signal === undefined ? {} : { signal: args.signal },
      }),
    })
    const state = await this.store.readState()
    await this.store.writeState({
      ...state,
      lastProvider: route.provider,
      lastModel: route.model,
    })
    return result
  }
}

/** Mount API, quiet-period upkeep, route capture, and relevance-gated pre-step recall. */
export function apply(ctx: Context, config: Config): void {
  const store = new MemoryDocumentStore(resolveDshHome())
  const scheduler = new IdleMemoryScheduler(ctx, store, { idleDelayMs: config.idleDelayMs })
  const service = new NativeMemoryService(ctx, store, scheduler)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: MEMORY_API_ROUTE,
    handler: (req, res) => { void memoryApiHandler(req, res, service) },
  }), 'memory-system: loopback document and selection API')
  ctx.effect(() => scheduler.listen(), 'memory-system: session activity quiets the upkeep timer')
  ctx.effect(() => scheduler.start(), 'memory-system: startup backfill and quiet-period ai-memory upkeep')

  ctx.on('agent/pre-step', async (
    { agent, messages, step, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || step !== 1) return decision
    const query = directText(messages)
    if (query === '') return decision
    const [user, ai] = await Promise.all([store.read('user'), store.read('ai')])
    if (signal.aborted) return decision
    const memory = memoryContextFor({
      query,
      ...agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd },
      userDocument: user.content,
      aiDocument: ai.content,
    })
    if (memory === undefined) return decision
    return {
      kind: 'enter',
      messages: injectMemoryContext(decision.messages, memory),
    }
  }, { prepend: true })
}

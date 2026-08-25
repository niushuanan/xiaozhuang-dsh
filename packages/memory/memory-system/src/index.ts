/** Native Host half of DSH's global two-document memory system. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session-query'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { MEMORY_API_ROUTE, memoryApiHandler, type MemoryApiService } from './api.ts'
import { localDayStart, memoryContextFor, nextLocalNoon, redactSensitiveText, shouldRunDailyMaintenance } from './domain.ts'
import { batchConversationEvidence, collectConversationChanges, maintainMemoryDocument } from './maintenance.ts'
import { generateMemoryWithLlm, type MemoryRoute } from './model.ts'
import { MemoryDocumentStore, type MemoryDocumentKind } from './store.ts'
import { injectMemoryContext } from './recall.ts'
import type { SelectionMemorySource } from './types.ts'

export { MEMORY_API_ROUTE } from './api.ts'
export { MemoryDocumentStore } from './store.ts'

export const name = 'memory-system'
export const inject = ['webServer', 'llm', 'sessionQuery', 'agents']

const MAX_TIMER_DELAY_MS = 2_147_483_647

function routeFor(agent: Agent): MemoryRoute | undefined {
  const latest = agent.session.requestHeader()?.config
  const provider = latest?.provider ?? agent.options.provider
  const model = latest?.model ?? agent.options.model
  return typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== ''
    ? { provider, model }
    : undefined
}

function directText(messages: readonly UserMessage[]): string {
  return messages
    .filter(message => message.source.kind === 'user')
    .flatMap(message => message.content)
    .filter((block): block is Extract<(typeof messages)[number]['content'][number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

class DailyMemoryRuntime {
  private timer: ReturnType<typeof setTimeout> | undefined
  private latestRoute: MemoryRoute | undefined
  private running: Promise<void> | undefined
  private stopped = false

  constructor(
    private readonly ctx: Context,
    private readonly store: MemoryDocumentStore,
  ) {}

  start(): () => void {
    for (const agent of this.ctx.agents.roots()) this.noteAgent(agent)
    this.requestCatchup()
    this.armNextNoon()
    return () => {
      this.stopped = true
      if (this.timer !== undefined) clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  noteAgent(agent: Agent): void {
    const route = routeFor(agent)
    if (route === undefined) return
    this.latestRoute = route
    this.requestCatchup()
  }

  private requestCatchup(): void {
    if (this.stopped || this.running !== undefined) return
    const run = this.runDue()
    this.running = run
    void run.finally(() => {
      if (this.running === run) this.running = undefined
    })
  }

  private armNextNoon(): void {
    if (this.stopped) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    const now = new Date()
    const offset = -now.getTimezoneOffset()
    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(1, nextLocalNoon(now, offset).getTime() - now.getTime()))
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.requestCatchup()
      this.armNextNoon()
    }, delay)
  }

  private async runDue(): Promise<void> {
    try {
      const now = new Date()
      const state = await this.store.readState()
      const offset = -now.getTimezoneOffset()
      if (!shouldRunDailyMaintenance(now, state.lastMaintenanceAt, offset)) return
      const route = this.latestRoute ?? (
        state.lastProvider !== undefined && state.lastModel !== undefined
          ? { provider: state.lastProvider, model: state.lastModel }
          : undefined
      )
      if (route === undefined) return
      const throughCursor = now.getTime()
      const fromCursor = Math.max(
        state.lastDailyCursor,
        Math.max(0, localDayStart(now, offset).getTime() - 1),
      )
      const conversations = await collectConversationChanges(
        this.ctx.sessionQuery,
        fromCursor,
        throughCursor,
      )
      for (const batch of batchConversationEvidence(conversations)) {
        await maintainMemoryDocument({
          store: this.store,
          kind: 'ai',
          source: { conversations: batch, fromCursor, throughCursor },
          route,
          generate: args => generateMemoryWithLlm(this.ctx, args.request, args.route, {
            ...args.sessionId === undefined ? {} : { sessionId: args.sessionId },
            ...args.signal === undefined ? {} : { signal: args.signal },
          }),
        })
      }
      await this.store.writeState({
        lastDailyCursor: throughCursor,
        lastMaintenanceAt: now.toISOString(),
        lastProvider: route.provider,
        lastModel: route.model,
      })
    } catch (error) {
      this.ctx.logger.warn(`memory-system: daily maintenance failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

class NativeMemoryService implements MemoryApiService {
  constructor(
    private readonly ctx: Context,
    private readonly store: MemoryDocumentStore,
    private readonly daily: DailyMemoryRuntime,
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

  async remember(source: SelectionMemorySource, signal?: AbortSignal) {
    const agent = this.ctx.agents.get(SessionId(source.sessionId))
    if (agent === undefined) throw new Error('the source conversation is not currently available')
    const route = routeFor(agent)
    if (route === undefined) throw new Error('the source conversation has no available model route')
    this.daily.noteAgent(agent)
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
      generate: args => generateMemoryWithLlm(this.ctx, args.request, args.route, {
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

/** Mount API, daily upkeep, route capture, and relevance-gated pre-step recall. */
export function apply(ctx: Context): void {
  const store = new MemoryDocumentStore(resolveDshHome())
  const daily = new DailyMemoryRuntime(ctx, store)
  const service = new NativeMemoryService(ctx, store, daily)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: MEMORY_API_ROUTE,
    handler: (req, res) => { void memoryApiHandler(req, res, service) },
  }), 'memory-system: loopback document and selection API')
  ctx.effect(() => daily.start(), 'memory-system: local-noon maintenance')
  ctx.on('agent/created', ({ agent }) => { daily.noteAgent(agent) })

  ctx.on('agent/pre-step', async (
    { agent, messages, step, signal },
    next,
  ): Promise<PreStepDecision> => {
    daily.noteAgent(agent)
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

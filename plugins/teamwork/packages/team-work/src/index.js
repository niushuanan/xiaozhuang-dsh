/**
 * team-work — 永久版 Team Work 模式插件（dsh web profile，host 半边）。
 *
 * 从会话级动态插件 teamw-1/pkg-5 移植而来，作为 host-plane 行挂在
 * ~/.dsh/profiles/web/cordis.patch.yml。不 publish 任何 service（纯消费 host
 * 服务），因此可以安全地以普通行形式插在 profile composition 里，对整个
 * 进程的所有会话生效。
 *
 * 能力：
 *  1) 提供独立的 Teamwork 会话状态与 /teamwork 命令。它叠加在权限预设之上，
 *     不再改写 sandbox mode 或 approval policy。
 *  2) 系统提示叙事（order 130）：仅当该会话的 Teamwork 状态开启时注入
 *     「先规划 → 用户确认 → 主模型调度 subagent（并发 ≤ 5）」的行为准则。
 *  3) 开启 Teamwork → 自动打开该 agent 的 plan mode（复用既有规划 UI 与
 *     exit_plan_mode 确认流）；关闭 → 自动关闭。planMode 服务在 preset realm
 *     内（每会话一份），故经 agentPresets.serviceFor(agent, 'planMode') 解析，
 *     host 平面缺失时回退 ctx.get('planMode')。
 *  4) 三层调度：产品原生 subagent / subagent_fork 是默认执行池；Codex 与
 *     Z Code 只在复杂任务、原生执行受阻、用户点名或独立复核确有价值时升级。
 *     外部复核默认只读，且实现与 Review 尽量由不同路线承担。
 *  5) 硬并发闸：Team Work 会话在已有 5 个子代理运行时拒绝再派发。
 *  6) 兼容旧日志：历史上最后选择 team-work 权限预设的会话会自动迁移为
 *     独立 Teamwork=true；原有底层权限 knob 保持不变。
 */

import { z } from 'zod'
import * as sessionFormat from '@deepseek-ai/dsh-session-format'

export const name = 'team-work'

// 关键依赖显式 inject；投影与命令是可选子能力，在 apply 内通过 ctx.inject
// 注册，从而保留 headless composition 的兼容性。
export const inject = ['systemPrompt', 'agents', 'agentPresets', 'subagents']

const TEAM_PRESET = 'team-work'
const MAX_CONCURRENT = 5

const EXTERNAL_EXPERTS = Object.freeze([
  {
    provider: 'codex',
    tool: 'subagent_codex',
    label: 'Codex',
    purpose: 'difficult coding, architecture, debugging, refactoring, or rigorous independent code review',
  },
  {
    provider: 'zcode',
    tool: 'subagent_zcode',
    label: 'Z Code',
    purpose: 'an alternative-model implementation, verification, product-behavior check, or independent second opinion',
  },
])

const TEAMWORK_BASE_CONTEXT = [
  'Team Work mode is active for this session: a huge-task workflow. Plan first, then delegate.',
  '1. While plan mode is active, only plan: explore, inspect, and produce the complete project plan through exit_plan_mode. Do not implement anything before the user approves that plan.',
  '2. Native execution is the default. After approval, decompose the plan into self-contained subtasks. Use subagent for fresh independent work and subagent_fork only when the child needs completed conversation context. Start independent native delegations together in one message and prefer their background path. Routine implementation, research, and testing stay in this native pool.',
]

const TEAMWORK_TAIL_CONTEXT = [
  '5. Concurrency cap: keep at most 5 delegated workers running at the same time across native and external lanes. When 5 are running, wait for one to settle before dispatching the next one; the runtime rejects starts above the cap, so read tool results and adapt.',
  '6. You are the orchestrator: choose the cheapest capable lane, review each result, send follow-ups or corrections with send_message when needed, reconcile conflicting reviews, integrate the outcome, and report progress and completion to the user. Do not redo a delegated subtask\u2019s work yourself.',
]

export function teamworkContextText(subagents) {
  const available = EXTERNAL_EXPERTS.filter(expert => subagents.getProvider(expert.provider) !== undefined)
  const external = available.length === 0
    ? [
        '3. No external expert Provider is callable for this turn. Stay in the native subagent pool and do not call unavailable external tools.',
        '4. Review must be independent. For a complex or high-risk change, assign review to a different native lane from the implementer. A review prompt is read-only by default: inspect the implementation, diff, and relevant test evidence; return findings with severity and evidence; do not edit files unless the user or orchestrator explicitly asks for fixes.',
      ]
    : [
        '3. External escalation is selective, never a quota to fill. Do not automatically call an external expert for ordinary tasks. Escalate only when the work is genuinely complex, a native attempt is blocked or insufficient, an independent review materially reduces risk, or the user explicitly asks for that product. Callable external experts for this turn:',
        ...available.map(expert => '- ' + expert.label + ' via ' + expert.tool + ': ' + expert.purpose + '.'),
        'Give an external expert a complete standalone prompt because it does not inherit this conversation; prefer run_in_background: true and collect it through the Job tools.',
        '4. Review must be independent. For a complex or high-risk change, assign review to a different lane from the implementer. A review prompt is read-only by default: inspect the implementation, diff, and relevant test evidence; return findings with severity and evidence; do not edit files unless the user or orchestrator explicitly asks for fixes. Normally use one external reviewer.'
          + (available.length > 1 ? ' Use both ' + available.map(expert => expert.label).join(' and ') + ' only for cross-cutting or unusually high-risk work, or when the first two opinions conflict.' : ''),
      ]
  return [...TEAMWORK_BASE_CONTEXT, ...external, ...TEAMWORK_TAIL_CONTEXT].join('\n')
}

const TEAMWORK_DELEGATION_TOOLS = new Set([
  'subagent',
  'subagent_fork',
  ...EXTERNAL_EXPERTS.map(expert => expert.tool),
])

function lastPreset(events) {
  if (events == null) return undefined
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event != null && event.type === 'permission/preset' && event.data != null) {
      return typeof event.data.preset === 'string' ? event.data.preset : undefined
    }
  }
  return undefined
}

const EMPTY_TEAMWORK_STATE = Object.freeze({ active: false, explicit: false })

/**
 * Fold the independent Teamwork switch. Before the first teamwork/state event,
 * the latest legacy permission selection is understood for migration only.
 * Once an explicit switch exists, later permission changes are intentionally
 * ignored: access and collaboration are separate dimensions.
 */
export function applyTeamworkEvent(state, event) {
  if (event != null && event.type === 'teamwork/state' && typeof event.data?.active === 'boolean') {
    return { active: event.data.active, explicit: true }
  }
  if (!state.explicit && event != null && event.type === 'permission/preset') {
    return { active: event.data?.preset === TEAM_PRESET, explicit: false }
  }
  return state
}

export function foldTeamwork(events) {
  let state = EMPTY_TEAMWORK_STATE
  for (const event of events ?? []) state = applyTeamworkEvent(state, event)
  return state
}

function sessionEvents(session) {
  return typeof session?.snapshotEvents === 'function'
    ? session.snapshotEvents()
    : session?.events ?? []
}

function isTeamWork(session) {
  return session != null && foldTeamwork(sessionEvents(session)).active
}

function teamworkOwner(agents, agent) {
  if (agent == null) return undefined
  if (isTeamWork(agent.session)) return agent
  if (agents === undefined) return undefined
  return agents.list().find(candidate =>
    candidate.id !== agent.id
    && isTeamWork(candidate.session)
    && agents.isOwnedBy(agent.id, candidate))
}

function countRunningChildren(agents, agent) {
  if (agents === undefined || agent == null) return 0
  let running = 0
  for (const candidate of agents.list()) {
    if (candidate.id !== agent.id && candidate.status === 'running' && agents.isOwnedBy(candidate.id, agent)) {
      running += 1
    }
  }
  return running
}

export function apply(ctx) {
  // v0/v1 persisted this complete boolean switch without the external-event marker.
  // Its payload has no event references and keeps the same meaning through v2.
  if (typeof sessionFormat.registerSessionFormatStateCompatibility === 'function') {
    const historicalState = z.object({ active: z.boolean() }).strict()
    ctx.effect(() => sessionFormat.registerSessionFormatStateCompatibility({
      type: 'teamwork/state',
      fromVersion: 0,
      toVersion: 2,
      accepts: data => historicalState.safeParse(data).success,
    }))
  }
  const agents = ctx.get('agents')
  const agentPresets = ctx.get('agentPresets')
  const subagents = ctx.get('subagents')

  // plan-mode 服务可能位于 host 平面，也可能在 agent 的 preset realm 内
  // （web profile 按会话隔离）。优先解析 agent 实际使用的那份：
  // preset realm 优先，host 平面兜底。
  const planModeFor = (agent) => {
    if (agent == null) return undefined
    if (agentPresets !== undefined) {
      try {
        const scoped = agentPresets.serviceFor(agent, 'planMode')
        if (scoped !== undefined) return scoped
      } catch (error) {
        console.error('[team-work] agentPresets.serviceFor failed:', error)
      }
    }
    return ctx.get('planMode')
  }

  // 1) 独立投影：浏览器只看到 { active }；explicit 只用于一次性兼容旧的
  // permission/preset=team-work 日志，永远不暴露成产品状态。
  const teamworkStateSchema = z.object({ active: z.boolean(), explicit: z.boolean() }).strict()
  const teamworkViewSchema = z.object({ active: z.boolean() }).strict()
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register({
      key: 'teamwork',
      stateSchema: teamworkStateSchema,
      init: () => EMPTY_TEAMWORK_STATE,
      apply: applyTeamworkEvent,
      wire: {
        viewSchema: teamworkViewSchema,
        view: state => ({ active: state.active }),
      },
      stateVersion: 1,
    })
  })

  // 唯一写路径：只追加 Teamwork 状态，不调用 /permission，也不触碰任何
  // sandbox / approval knob。
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'teamwork',
      description: 'Enable or disable Teamwork without changing the permission preset',
      input: { hint: '<on|off>' },
      handler: ({ agent, rawInput }) => {
        const input = rawInput.trim().toLowerCase()
        const current = isTeamWork(agent.session)
        if (input === '') return { kind: 'success', text: `Teamwork ${current ? 'on' : 'off'}` }
        const active = input === 'on' ? true : input === 'off' ? false : undefined
        if (active === undefined) return { kind: 'error', text: 'usage: /teamwork <on|off>' }
        if (active !== current) agent.session.appendExternal('teamwork/state', { active })
        return { kind: 'success', text: `Teamwork ${active ? 'on' : 'off'}` }
      },
    })
  })

  // 2) Team Work 叙事，逐次装配求值——只有独立开关开启的会话收到。
  ctx.systemPrompt.context({
    name: 'teamwork:policy',
    order: 130,
    text: (context) => {
      const session = context != null && context.agent != null ? context.agent.session : undefined
      return isTeamWork(session) ? teamworkContextText(subagents) : ''
    },
  })

  // 3) 开启 Team Work → 打开 plan mode，下一次请求先规划（复用既有规划 UI
  // 与 exit_plan_mode 确认）；关闭 → 关闭。作用域事件监听需要 { global: true }：
  // 本包不在任何会话的作用域路径上。
  const teamWorkSessions = new Set()
  const runningExternal = new Map()
  const syncPlanMode = (agent, active) => {
    if (agent == null) return
    if (active) {
      if (teamWorkSessions.has(agent.id)) return
      const planMode = planModeFor(agent)
      if (planMode === undefined) {
        console.error('[team-work] planMode service is unavailable for session ' + agent.id + '; plan-first workflow cannot activate (does its agent preset mount dsh-plan-mode?)')
        return
      }
      planMode.set(agent, true)
      teamWorkSessions.add(agent.id)
      return
    }
    if (!teamWorkSessions.delete(agent.id)) return
    const planMode = planModeFor(agent)
    if (planMode !== undefined) planMode.set(agent, false)
  }

  // Hot-unplug cleanup: an already selected Teamwork session must not retain
  // plan mode after this package is disabled from the plugin center.
  ctx.effect(() => () => {
    if (agents === undefined) return
    for (const agentId of teamWorkSessions) {
      const agent = agents.get(agentId)
      const planMode = planModeFor(agent)
      if (agent !== undefined && planMode !== undefined) planMode.set(agent, false)
    }
    teamWorkSessions.clear()
  })

  ctx.on('session/event', (session, event) => {
    if (event == null || event.type !== 'teamwork/state' || session == null) return
    const agent = agents !== undefined ? agents.get(session.id) : undefined
    syncPlanMode(agent, event.data?.active === true)
  }, { global: true })

  const migrateLegacy = (agent) => {
    if (agent == null) return
    const events = sessionEvents(agent.session)
    const folded = foldTeamwork(events)
    if (!folded.explicit && lastPreset(events) === TEAM_PRESET) {
      agent.session.appendExternal('teamwork/state', { active: true })
    }
  }

  // Projection registration is hot-pluggable, while the browser projection
  // store is push-driven. Reassert the whole current value once when an Agent
  // joins this plugin lifetime so an already-open task receives the new key
  // immediately, including the ordinary inactive state.
  const publishTeamworkState = (agent) => {
    if (agent == null) return
    const active = isTeamWork(agent.session)
    agent.session.appendExternal('teamwork/state', { active })
  }

  // 老会话可能先持久化旧 team-work permission，再注册实际 Agent。
  // 注册时补一次显式状态，使之后切换权限不会再影响 Teamwork。
  ctx.on('agent/created', ({ agent }) => {
    publishTeamworkState(agent)
  }, { global: true })

  // rc.7 在 agent 的 preset realm 里提供 planMode；第一条请求的 pre-step
  // 是该服务确定可用、且仍早于请求组装的最终同步边界。
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    migrateLegacy(agent)
    syncPlanMode(agent, isTeamWork(agent.session))
    return await next()
  }, { global: true })

  ctx.on('agent/disposed', ({ agent }) => {
    teamWorkSessions.delete(agent.id)
    runningExternal.delete(agent.id)
  }, { global: true })

  // 外部协作者没有 Harness child Session，但仍属于 Teamwork 的同一协作池。
  // 工具执行中间件覆盖显式点名和 Teamwork 自动调度两条入口。
  ctx.on('tools/execute', async (exec, next) => {
    const owner = teamworkOwner(agents, exec?.agent)
    if (owner == null
      || (exec.name !== 'subagent_codex' && exec.name !== 'subagent_zcode')) return next()
    runningExternal.set(owner.id, (runningExternal.get(owner.id) ?? 0) + 1)
    try { return await next() } finally {
      const remaining = (runningExternal.get(owner.id) ?? 1) - 1
      if (remaining > 0) runningExternal.set(owner.id, remaining)
      else runningExternal.delete(owner.id)
    }
  }, { global: true })

  // 5) 硬并发闸：Team Work 激活期间，该会话已有 5 个子代理运行时拒绝新的
  // 派发。
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec == null || !TEAMWORK_DELEGATION_TOOLS.has(exec.name)) return next()
    const owner = teamworkOwner(agents, exec.agent)
    if (owner == null) return next()
    const running = countRunningChildren(agents, owner) + (runningExternal.get(owner.id) ?? 0)
    if (running >= MAX_CONCURRENT) {
      return {
        kind: 'deny',
        reason: `Team Work concurrency cap: ${running} subagents are already running (max ${MAX_CONCURRENT}). Wait for one to settle before starting another.`,
      }
    }
    return next()
  }, { global: true })

  // 6) 启动迁移只追加独立 Teamwork 状态；不会改写或重申用户权限。
  if (agents !== undefined) {
    for (const agent of agents.list()) {
      try {
        publishTeamworkState(agent)
      } catch (error) {
        console.error('[team-work] legacy state migration failed:', error)
      }
    }
  }
}

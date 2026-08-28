/** Closed Xiaozhuang capability catalog shared by controls, UI, and export. */

import type {} from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Records whether the Xiaozhuang Web Profile's Teamwork workflow is active.
     * The out-of-tree Teamwork package writes this log-only state; declaring it
     * in the repository keeps its durable history readable by the fail-closed
     * session persistence vocabulary.
     */
    'teamwork/state': { active: boolean }
  }
}

export interface PluginCompositionRow {
  readonly id: string
  readonly name: string
  readonly config?: Readonly<Record<string, unknown>>
}

export interface PluginExportSource {
  readonly kind: 'repository' | 'profile'
  readonly path: string
}

export interface PluginExportDefinition {
  readonly id: string
  readonly name: string
  readonly rows: readonly PluginCompositionRow[]
  readonly sources: readonly PluginExportSource[]
}

export type PluginExportCatalog = Readonly<Record<string, PluginExportDefinition>>

export const PLUGIN_ROWS = Object.freeze({
  'better-sidebar': ['better-sidebar'],
  teamwork: ['team-work'],
  'parallel-development': ['parallel-development'],
  vision: ['vision-local'],
  'product-companion': ['ui-product-companion'],
  'plain-chat': ['ui-plain-chat'],
  'multi-window': ['ui-multi-window'],
  'selection-actions': ['ui-selection-actions'],
  'memory-system': ['memory-system'],
  'adaptive-update': ['ui-adaptive-update'],
  'model-usage': ['ui-provider-quota'],
  'runtime-pulse': ['runtime-pulse'],
  'skill-manager': ['ui-skill-manager'],
  'token-overview': ['token-overview'],
  'fluent-output': ['fluent-output'],
  'session-modes': ['ui-agent-preset'],
  codex: ['subagent-codex-local', 'tool-subagent-codex-local'],
  zcode: ['subagent-zcode-local', 'tool-subagent-zcode-local'],
} satisfies Record<string, readonly string[]>)

export const PLUGIN_EXPORT_CATALOG: PluginExportCatalog = Object.freeze({
  'better-sidebar': {
    id: 'better-sidebar', name: '侧边工作台',
    rows: [
      { id: 'better-sidebar', name: '@deepseek-ai/dsh-better-sidebar' },
    ],
    sources: [
      { kind: 'repository', path: 'packages/workbench/better-sidebar' },
    ],
  },
  teamwork: {
    id: 'teamwork', name: 'Teamwork',
    rows: [
      { id: 'team-work', name: '@deepseek-ai/dsh-team-work' },
      { id: 'subagent-codex-local', name: '@deepseek-ai/dsh-subagent-codex', config: { providerName: 'codex', permissionMode: 'approve-for-me' } },
      { id: 'tool-subagent-codex-local', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'codex', toolName: 'subagent_codex', routingGuidance: 'Use Codex for difficult coding, architecture, debugging, refactoring, or rigorous independent code review.', backgroundMode: 'one-shot', maxDepth: 'provider-managed' } },
      { id: 'subagent-zcode-local', name: '@deepseek-ai/dsh-subagent-zcode-local', config: { providerName: 'zcode', providerId: 'builtin:zai', modelId: 'GLM-5.3', permissionMode: 'edit' } },
      { id: 'tool-subagent-zcode-local', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'zcode', toolName: 'subagent_zcode', routingGuidance: 'Use Z Code for an alternative-model implementation, verification, product-behavior check, or independent second opinion.', backgroundMode: 'one-shot', maxDepth: 'provider-managed' } },
    ],
    sources: [
      { kind: 'profile', path: 'team-work' },
      { kind: 'profile', path: 'zcode-subagent' },
      { kind: 'repository', path: 'packages/subagent/subagent-codex' },
      { kind: 'repository', path: 'packages/subagent/tool-subagent' },
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/standard' },
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/ptc' },
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/cordis' },
    ],
  },
  'parallel-development': {
    id: 'parallel-development', name: '并发 worktree 协作',
    rows: [{ id: 'parallel-development', name: '@deepseek-ai/dsh-parallel-development' }],
    sources: [{ kind: 'profile', path: 'parallel-development' }],
  },
  vision: {
    id: 'vision', name: '图片理解',
    rows: [{ id: 'vision-local', name: '@deepseek-ai/dsh-vision-local' }],
    sources: [{ kind: 'profile', path: 'vision-local' }],
  },
  'product-companion': {
    id: 'product-companion', name: '鲸少女',
    rows: [{ id: 'ui-product-companion', name: '@deepseek-ai/dsh-client-ui-product-companion' }],
    sources: [{ kind: 'repository', path: 'packages/client/ui-product-companion' }],
  },
  'plain-chat': {
    id: 'plain-chat', name: '纯聊天',
    rows: [
      { id: 'ui-plain-chat', name: '@deepseek-ai/dsh-client-ui-plain-chat' },
      { id: 'composer-add-menu', name: '@deepseek-ai/dsh-composer-add-menu' },
    ],
    sources: [
      { kind: 'repository', path: 'packages/client/ui-plain-chat' },
      { kind: 'repository', path: 'packages/client/ui-composer-add-menu' },
      { kind: 'repository', path: 'packages/client/ui-chat' },
      { kind: 'repository', path: 'packages/client/ui-sidebar' },
      { kind: 'repository', path: 'packages/client/ui-workspace' },
      { kind: 'repository', path: 'packages/client/ui-conversation' },
      { kind: 'repository', path: 'packages/client/ui-agent-preset' },
      { kind: 'repository', path: 'packages/client/ui-primitives' },
      { kind: 'repository', path: 'packages/api/session-controller' },
      { kind: 'repository', path: 'packages/preset/agent-presets/presets/chat' },
    ],
  },
  'multi-window': {
    id: 'multi-window', name: '多对话分屏',
    rows: [{ id: 'ui-multi-window', name: '@deepseek-ai/dsh-client-ui-multi-window' }],
    sources: [{ kind: 'repository', path: 'packages/client/ui-multi-window' }],
  },
  'selection-actions': {
    id: 'selection-actions', name: '选中操作',
    rows: [{ id: 'ui-selection-actions', name: '@deepseek-ai/dsh-client-ui-selection-actions' }],
    sources: [{ kind: 'repository', path: 'packages/client/ui-selection-actions' }],
  },
  'memory-system': {
    id: 'memory-system', name: '长期记忆',
    rows: [{ id: 'memory-system', name: '@deepseek-ai/dsh-memory-system' }],
    sources: [{ kind: 'repository', path: 'packages/memory/memory-system' }],
  },
  'adaptive-update': {
    id: 'adaptive-update', name: '持续适配',
    rows: [{ id: 'ui-adaptive-update', name: '@deepseek-ai/dsh-client-ui-adaptive-update' }],
    sources: [{ kind: 'repository', path: 'packages/client/ui-adaptive-update' }],
  },
  'model-usage': {
    id: 'model-usage', name: '模型用量',
    rows: [{ id: 'ui-provider-quota', name: '@deepseek-ai/dsh-client-ui-provider-quota' }],
    sources: [{ kind: 'repository', path: 'packages/client/ui-provider-quota' }],
  },
  'runtime-pulse': {
    id: 'runtime-pulse', name: '会话运行详情',
    rows: [{ id: 'runtime-pulse', name: '@deepseek-ai/dsh-runtime-pulse' }],
    sources: [{ kind: 'profile', path: 'runtime-pulse' }],
  },
  'skill-manager': {
    id: 'skill-manager', name: 'Skill 管理',
    rows: [{ id: 'ui-skill-manager', name: '@deepseek-ai/dsh-client-ui-skill-manager' }],
    sources: [{ kind: 'repository', path: 'packages/client/ui-skill-manager' }],
  },
  'token-overview': {
    id: 'token-overview', name: 'Token 总览',
    rows: [{ id: 'token-overview', name: '@deepseek-ai/dsh-token-overview' }],
    sources: [{ kind: 'profile', path: 'token-overview' }],
  },
  'fluent-output': {
    id: 'fluent-output', name: '流畅输出',
    rows: [{ id: 'fluent-output', name: '@deepseek-ai/dsh-fluent-output', config: { mode: 'typewriter', preset: 'balanced', revealCharsPerSec: 80, scrollSpeedPxPerSec: 48, maxScrollSpeedPxPerSec: 1000 } }],
    sources: [{ kind: 'profile', path: 'fluent-output' }],
  },
  'session-modes': {
    id: 'session-modes', name: 'Agent 预设',
    rows: [{ id: 'ui-agent-preset', name: '@deepseek-ai/dsh-client-ui-agent-preset' }],
    sources: [{ kind: 'repository', path: 'packages/client/ui-agent-preset' }],
  },
})

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
  readonly kind: 'repository' | 'profile' | 'product'
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
  'chat-mode': ['ui-plain-chat'],
  'conversation-import': ['conversation-import'],
  'multi-window': ['ui-multi-window'],
  'selection-actions': ['ui-selection-actions'],
  'memory-system': ['memory-system'],
  'adaptive-update': ['ui-adaptive-update'],
  'model-usage': ['ui-provider-quota'],
  'runtime-pulse': ['runtime-pulse'],
  'skill-manager': ['ui-skill-manager'],
  'token-overview': ['token-overview'],
  'fluent-output': ['fluent-output'],
  'session-modes': ['session-modes'],
  codex: ['subagent-codex-local', 'tool-subagent-codex-local'],
  zcode: ['subagent-zcode-local', 'tool-subagent-zcode-local'],
} satisfies Record<string, readonly string[]>)

export const PLUGIN_EXPORT_CATALOG: PluginExportCatalog = Object.freeze({
  'better-sidebar': {
    id: 'better-sidebar', name: '侧边工作台',
    rows: [
      { id: 'better-sidebar', name: './lib/index.js' },
    ],
    sources: [
      { kind: 'product', path: 'plugins/better-sidebar' },
    ],
  },
  teamwork: {
    id: 'teamwork', name: 'Teamwork',
    rows: [
      { id: 'team-work', name: './packages/team-work/lib/index.js' },
      { id: 'subagent-codex-local', name: '@deepseek-ai/dsh-subagent-codex', config: { providerName: 'codex', permissionMode: 'approve-for-me' } },
      { id: 'tool-subagent-codex-local', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'codex', toolName: 'subagent_codex', routingGuidance: 'Use Codex for difficult coding, architecture, debugging, refactoring, or rigorous independent code review.', backgroundMode: 'one-shot', maxDepth: 'provider-managed' } },
      { id: 'subagent-zcode-local', name: './packages/zcode-subagent/lib/index.js', config: { providerName: 'zcode', providerId: 'builtin:zai', modelId: 'GLM-5.3', permissionMode: 'edit' } },
      { id: 'tool-subagent-zcode-local', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'zcode', toolName: 'subagent_zcode', routingGuidance: 'Use Z Code for an alternative-model implementation, verification, product-behavior check, or independent second opinion.', backgroundMode: 'one-shot', maxDepth: 'provider-managed' } },
    ],
    sources: [{ kind: 'product', path: 'plugins/teamwork' }],
  },
  'parallel-development': {
    id: 'parallel-development', name: '并发 worktree 协作',
    rows: [{ id: 'parallel-development', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/parallel-development' }],
  },
  vision: {
    id: 'vision', name: '图片理解',
    rows: [{ id: 'vision-local', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/vision' }],
  },
  'product-companion': {
    id: 'product-companion', name: '鲸少女',
    rows: [{ id: 'ui-product-companion', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/product-companion' }],
  },
  'chat-mode': {
    id: 'chat-mode', name: '聊天模式',
    rows: [
      { id: 'chat-preset', name: './packages/chat-preset/lib/index.js' },
      { id: 'ui-plain-chat', name: './packages/ui-plain-chat/lib/index.js' },
      { id: 'composer-add-menu', name: './packages/composer-add-menu/lib/index.js' },
    ],
    sources: [{ kind: 'product', path: 'plugins/chat-mode' }],
  },
  'conversation-import': {
    id: 'conversation-import', name: '导入对话',
    rows: [
      { id: 'conversation-import', name: './lib/index.js' },
    ],
    sources: [{ kind: 'product', path: 'plugins/conversation-import' }],
  },
  'multi-window': {
    id: 'multi-window', name: '多对话分屏',
    rows: [{ id: 'ui-multi-window', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/multi-window' }],
  },
  'selection-actions': {
    id: 'selection-actions', name: '选中操作',
    rows: [{ id: 'ui-selection-actions', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/selection-actions' }],
  },
  'memory-system': {
    id: 'memory-system', name: '长期记忆',
    rows: [{ id: 'memory-system', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/memory-system' }],
  },
  'adaptive-update': {
    id: 'adaptive-update', name: '持续适配',
    rows: [{ id: 'ui-adaptive-update', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/adaptive-update' }],
  },
  'model-usage': {
    id: 'model-usage', name: '模型用量',
    rows: [{ id: 'ui-provider-quota', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/model-usage' }],
  },
  'runtime-pulse': {
    id: 'runtime-pulse', name: '会话运行详情',
    rows: [{ id: 'runtime-pulse', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/runtime-pulse' }],
  },
  'skill-manager': {
    id: 'skill-manager', name: 'Skill 管理',
    rows: [{ id: 'ui-skill-manager', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/skill-manager' }],
  },
  'token-overview': {
    id: 'token-overview', name: 'Token 总览',
    rows: [{ id: 'token-overview', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/token-overview' }],
  },
  'fluent-output': {
    id: 'fluent-output', name: '流畅输出',
    rows: [{ id: 'fluent-output', name: './lib/index.js', config: { mode: 'typewriter', preset: 'balanced', revealCharsPerSec: 80, scrollSpeedPxPerSec: 48, maxScrollSpeedPxPerSec: 1000 } }],
    sources: [{ kind: 'product', path: 'plugins/fluent-output' }],
  },
  'session-modes': {
    id: 'session-modes', name: 'Agent 预设',
    rows: [{ id: 'session-modes', name: './lib/index.js' }],
    sources: [{ kind: 'product', path: 'plugins/session-modes' }],
  },
})

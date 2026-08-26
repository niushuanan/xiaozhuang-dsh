/** Closed Xiaozhuang capability catalog shared by controls, UI, and export. */

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
  'computer-use': ['computer-use', 'ui-computer-use'],
  teamwork: ['team-work'],
  'parallel-development': ['parallel-development'],
  vision: ['vision-local'],
  'product-companion': ['ui-product-companion'],
  'multi-window': ['ui-multi-window'],
  'selection-actions': ['ui-selection-actions'],
  'memory-system': ['memory-system'],
  'model-usage': ['ui-provider-quota'],
  'runtime-pulse': ['runtime-pulse'],
  'composer-add-menu': ['composer-add-menu'],
  'token-overview': ['token-overview'],
  'fluent-output': ['fluent-output'],
  'session-modes': ['ui-agent-preset'],
  codex: ['subagent-codex-local', 'tool-subagent-codex-local'],
  zcode: ['subagent-zcode-local', 'tool-subagent-zcode-local'],
} satisfies Record<string, readonly string[]>)

export const PLUGIN_EXPORT_CATALOG: PluginExportCatalog = Object.freeze({
  'computer-use': {
    id: 'computer-use', name: 'Computer Use',
    rows: [
      { id: 'computer-use', name: '@deepseek-ai/dsh-computer-use', config: { desktopEnabled: true, defaultBrowserMode: 'isolated', connectedBrowserNewTab: true } },
      { id: 'ui-computer-use', name: '@deepseek-ai/dsh-client-ui-computer-use' },
    ],
    sources: [
      { kind: 'repository', path: 'packages/computer-use/computer-use' },
      { kind: 'repository', path: 'packages/client/ui-computer-use' },
    ],
  },
  teamwork: {
    id: 'teamwork', name: 'Teamwork',
    rows: [
      { id: 'team-work', name: '@deepseek-ai/dsh-team-work' },
      { id: 'subagent-codex-local', name: '@deepseek-ai/dsh-subagent-codex', config: { providerName: 'codex', permissionMode: 'approve-for-me' } },
      { id: 'tool-subagent-codex-local', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'codex', toolName: 'subagent_codex', backgroundMode: 'one-shot', maxDepth: 'provider-managed' } },
      { id: 'subagent-zcode-local', name: '@deepseek-ai/dsh-subagent-zcode-local', config: { providerName: 'zcode', providerId: 'builtin:zai', modelId: 'GLM-5.3', permissionMode: 'edit' } },
      { id: 'tool-subagent-zcode-local', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'zcode', toolName: 'subagent_zcode', backgroundMode: 'one-shot', maxDepth: 'provider-managed' } },
    ],
    sources: [
      { kind: 'profile', path: 'team-work' },
      { kind: 'profile', path: 'zcode-subagent' },
      { kind: 'repository', path: 'packages/subagent/subagent-codex' },
      { kind: 'repository', path: 'packages/subagent/tool-subagent' },
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
    id: 'memory-system', name: '记忆体系',
    rows: [{ id: 'memory-system', name: '@deepseek-ai/dsh-memory-system' }],
    sources: [{ kind: 'repository', path: 'packages/memory/memory-system' }],
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
  'composer-add-menu': {
    id: 'composer-add-menu', name: '添加、插件与技能',
    rows: [{ id: 'composer-add-menu', name: '@deepseek-ai/dsh-composer-add-menu' }],
    sources: [{ kind: 'profile', path: 'composer-add-menu' }],
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

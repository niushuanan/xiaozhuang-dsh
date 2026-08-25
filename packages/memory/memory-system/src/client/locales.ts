export const NS = 'memorySystem'

export const zh = {
  title: '记忆体系',
  'tab.user': '选中记忆',
  'tab.ai': 'AI主动记忆',
  'editor.user': '编辑选中记忆',
  'editor.ai': '编辑 AI主动记忆',
  save: '保存',
  saving: '正在保存…',
  restore: '恢复上一版',
  restoring: '正在恢复…',
  saved: '已保存',
  restored: '已恢复上一版',
  loading: '正在读取记忆…',
  retry: '重试',
  empty: '暂无记忆。',
  'updatedAt': '更新于 {time}',
} as const

export const en: Record<keyof typeof zh, string> = {
  title: 'Memory',
  'tab.user': 'Selection memory',
  'tab.ai': 'AI memory',
  'editor.user': 'Edit selection memory',
  'editor.ai': 'Edit AI memory',
  save: 'Save',
  saving: 'Saving…',
  restore: 'Restore previous',
  restoring: 'Restoring…',
  saved: 'Saved',
  restored: 'Previous revision restored',
  loading: 'Loading memory…',
  retry: 'Retry',
  empty: 'No memory yet.',
  'updatedAt': 'Updated {time}',
}

export type MemoryLocaleKey = keyof typeof zh

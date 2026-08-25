import type {} from '@deepseek-ai/dsh-client-ui-slots'

export const NS = 'selectionActions'

export const zh = {
  quote: '引用',
  memory: '记忆',
  sideChat: '侧边聊天',
  quoting: '正在引用…',
  openingSideChat: '正在打开…',
  remembering: '正在整理记忆…',
  undo: '撤销',
  undone: '已撤销这次记忆',
  'quote.limit': '已达到多对话分屏上限',
  'quote.unavailable': '多对话分屏当前不可用',
  'quote.count': '{count} 个已选文本',
  'quote.remove': '移除引用',
  'memory.unavailable': '记忆体系当前不可用，请在插件中心开启',
  'memory.done': '已写入用户主动记忆',
} as const

export const en: Record<keyof typeof zh, string> = {
  quote: 'Quote',
  memory: 'Remember',
  sideChat: 'Side chat',
  quoting: 'Quoting…',
  openingSideChat: 'Opening…',
  remembering: 'Curating memory…',
  undo: 'Undo',
  undone: 'Memory change undone',
  'quote.limit': 'The split conversation limit has been reached',
  'quote.unavailable': 'Split conversations are currently unavailable',
  'quote.count': '{count} selected text',
  'quote.remove': 'Remove quote',
  'memory.unavailable': 'Memory System is unavailable; enable it in Plugin Center',
  'memory.done': 'Saved to user memory',
}

export type SelectionLocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { selectionActions: SelectionLocaleKey }
}

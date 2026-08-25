export const NS = 'multiWindow'

export const zh = {
  'action.open': '并排打开',
  'action.visible': '已在当前页面',
  'action.limit': '当前页面最多并排 4 个对话',
  'pane.close': '关闭“{title}”',
  'pane.resize': '调整“{left}”与“{right}”的宽度；双击恢复均分',
  'pane.untitled': '未命名对话',
  'drop.open': '松开以并排打开',
  'drop.limit': '当前页面已满，关闭一个分块后再拖入',
} as const

export type MultiWindowLocaleKey = keyof typeof zh

export const en: Record<MultiWindowLocaleKey, string> = {
  'action.open': 'Open Side by Side',
  'action.visible': 'Already on This Page',
  'action.limit': 'Up to 4 conversations can share this page',
  'pane.close': 'Close “{title}”',
  'pane.resize': 'Resize “{left}” and “{right}”; double-click to distribute evenly',
  'pane.untitled': 'Untitled conversation',
  'drop.open': 'Drop to open side by side',
  'drop.limit': 'This page is full. Close a pane before adding another',
}

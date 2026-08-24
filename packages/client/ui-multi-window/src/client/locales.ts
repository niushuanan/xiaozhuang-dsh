export const NS = 'multiWindow'

export const zh = {
  'action.open': '另开窗口',
  'action.limit': '最多同时打开 4 个窗口',
  'action.blocked': '新窗口被浏览器拦截',
} as const

export type MultiWindowLocaleKey = keyof typeof zh

export const en: Record<MultiWindowLocaleKey, string> = {
  'action.open': 'Open in New Window',
  'action.limit': 'Up to 4 windows can be open at once',
  'action.blocked': 'The browser blocked the new window',
}

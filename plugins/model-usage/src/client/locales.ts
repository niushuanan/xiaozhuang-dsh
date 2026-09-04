/** The usage panel is intentionally Chinese-only; provider brands stay Latin. */

export const NS = 'quota'

export const zh = {
  'trigger.label': '用量',
  'trigger.aria': '模型用量',
  'panel.aria': '模型用量概览',
  'panel.title': '模型用量',
  'refresh': '刷新用量',
  'auto-refresh': '每 5 分钟自动刷新',
  'refreshing': '正在刷新…',
  'updated.at': '更新于 {time}',
  'reset.timezone': '重置时间为北京时间',
  'refresh.failed': '本次刷新失败',
  'status.no-key': '账号未连接',
  'status.error': '暂时无法查询',
  'status.connect': '请在本机登录或配置该厂商账号。',
  'status.retry': '请点击刷新重试。',
  'money.total': '账户余额',
  'quota.weekly': '本周已用',
  'quota.rolling-5h': '5 小时已用',
  'quota.percent': '{percent}%',
  'quota.not-reported': '暂无数据',
  'quota.reset.at': '{time} 重置',
  'quota.reset.unused': '未使用，暂无重置',
  'quota.reset.unknown': '厂商未提供重置时间',
  'load.error': '暂时无法加载，请点击刷新重试。',
} as const

export const en: Record<QuotaKey, string> = { ...zh }

export type QuotaKey = keyof typeof zh

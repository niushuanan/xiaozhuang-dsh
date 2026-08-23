/** Simplified-Chinese companion dictionary and key source of truth. */
export const zh = {
  name: '小鲸灵',
  'state.idle': '在旁边陪你',
  'state.working': '正在陪你工作',
  'state.waiting': '有任务等你确认',
  'state.success': '刚刚完成了一项任务',
  'state.sleep': '休息中',
  'summary.empty': '现在没有运行中的任务',
  'summary.counts': '进行中 {running} · 等待 {waiting}',
  'section.skin': '皮肤',
  'skin.blue': '深海蓝',
  'skin.black': '鲸夜黑',
  reset: '回到目录旁',
  hint: '点击查看状态，拖动可以换位置',
  open: '查看小鲸灵',
  close: '收起小鲸灵',
} satisfies Record<string, string>

export type CompanionLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  name: 'Whale Companion',
  'state.idle': 'Keeping you company',
  'state.working': 'Working beside you',
  'state.waiting': 'A task needs your attention',
  'state.success': 'A task just finished',
  'state.sleep': 'Resting',
  'summary.empty': 'No task is running right now',
  'summary.counts': '{running} running · {waiting} waiting',
  'section.skin': 'Appearance',
  'skin.blue': 'Deep blue',
  'skin.black': 'Night black',
  reset: 'Return beside the sidebar',
  hint: 'Click for status. Drag to move.',
  open: 'Open Whale Companion',
  close: 'Close Whale Companion',
} satisfies Record<CompanionLocaleKey, string>

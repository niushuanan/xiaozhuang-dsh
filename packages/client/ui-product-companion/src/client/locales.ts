/** Simplified-Chinese companion dictionary and key source of truth. */
export const zh = {
  name: '小鲸灵',
  'state.idle': '在旁边陪你',
  'state.working': '正在陪你工作',
  'state.waiting': '有任务等你确认',
  'state.success': '刚刚完成了一项任务',
  'state.sleep': '休息中',
  'bubble.waiting': '这里需要你确认',
  'bubble.success': '完成啦',
  interact: '和小鲸灵互动',
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
  'bubble.waiting': 'This needs your attention',
  'bubble.success': 'All done',
  interact: 'Interact with Whale Companion',
} satisfies Record<CompanionLocaleKey, string>

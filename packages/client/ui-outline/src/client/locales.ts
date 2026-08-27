/** Dictionary namespace owned by the conversation outline plugin. */

/** Chinese dictionary, the source of truth for the key set. */
export const zh = {
  'outline.rail.aria': '对话大纲',
  'outline.turn.aria': '跳转到这一轮：{question}',
} satisfies Record<string, string>

/** The outline namespace key union. */
export type OutlineKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'outline.rail.aria': 'Conversation outline',
  'outline.turn.aria': 'Jump to this turn: {question}',
} satisfies Record<OutlineKey, string>

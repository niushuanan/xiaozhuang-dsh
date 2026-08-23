/** `plan` namespace dictionaries (the top-level plan status copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'status.on.label': '规划模式',
  'status.on.aria': '规划模式已开启，按下关闭',
  'status.on.title': '规划模式已开启，点击关闭',
} satisfies Record<string, string>

/** The plan namespace key union. */
export type PlanKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'status.on.label': 'Planning mode',
  'status.on.aria': 'Planning mode is on, press to turn it off',
  'status.on.title': 'Planning mode is on, click to turn it off',
} satisfies Record<PlanKey, string>

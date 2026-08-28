/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'systemPrompt.title': 'System Prompt',
  'systemPrompt.description': '直接编辑 DSH 当前的基础系统提示词；保存后从所有对话的下一轮起生效。',
  'systemPrompt.priority': '优先级：低于 AGENTS.md，高于 DSH 其他提示词。支持 model 与 cwd 模板变量。',
  'systemPrompt.loading': '正在读取当前 System Prompt…',
  'systemPrompt.error': '无法读取或保存 System Prompt；模板变量只支持 model 与 cwd。',
  'systemPrompt.conflict': '文件已在其他地方更新，为避免覆盖请载入最新内容。',
  'systemPrompt.editorLabel': '编辑全局 System Prompt',
  'systemPrompt.placeholder': '写下希望 DSH 在所有对话中使用的基础 System Prompt。',
  'systemPrompt.loadLatest': '载入最新内容',
  'systemPrompt.retry': '重试',
  'systemPrompt.save': '保存修改',
  'systemPrompt.saving': '正在保存…',
  'systemPrompt.unsaved': '有未保存修改',
  'systemPrompt.saved': '已从下一轮全局生效',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'systemPrompt.title': 'System Prompt',
  'systemPrompt.description': 'Edit DSH\'s current base system prompt directly; saves apply to every conversation from its next turn.',
  'systemPrompt.priority': 'Priority: below AGENTS.md and above all other DSH prompts. Supports the model and cwd template variables.',
  'systemPrompt.loading': 'Loading the current System Prompt…',
  'systemPrompt.error': 'The System Prompt could not be loaded or saved; only model and cwd template variables are supported.',
  'systemPrompt.conflict': 'The file changed elsewhere. Load the latest content to avoid overwriting it.',
  'systemPrompt.editorLabel': 'Edit the global System Prompt',
  'systemPrompt.placeholder': 'Write the base System Prompt DSH should use in every conversation.',
  'systemPrompt.loadLatest': 'Load latest content',
  'systemPrompt.retry': 'Retry',
  'systemPrompt.save': 'Save changes',
  'systemPrompt.saving': 'Saving…',
  'systemPrompt.unsaved': 'Unsaved changes',
  'systemPrompt.saved': 'Active globally from the next turn',
} satisfies Record<SettingsKey, string>

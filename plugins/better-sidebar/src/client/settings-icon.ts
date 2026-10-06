/** Side card artwork waits for the settings shell's keyed declaration. */
import { IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarSlotsService } from '../context-types.ts'

export function registerSettingsIcon(slots: SidebarSlotsService): () => void {
  return slots.inject('settings.section.icon', () => slots.register({
    name: 'settings.section.icon', key: 'better-sidebar',
  }, IconPanelLeftOutlineRegular))
}

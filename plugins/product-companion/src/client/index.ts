/** Browser half of the native cross-page product companion plugin. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { ProductCompanion } from './ProductCompanion.tsx'
import { ProductCompanionSettings } from './ProductCompanionSettings.tsx'
import { en, zh, type CompanionLocaleKey } from './locales.ts'
import { createCompanionStore, persistedCompanionName } from './store.ts'

export {
  ProductCompanion, companionDissolveMaskUrl, companionFrameUrl,
  type CompanionVisualState, type ProductCompanionInjected,
} from './ProductCompanion.tsx'
export type { CompanionAssetClip, CompanionTrackName } from './animation.ts'
export { ProductCompanionSettings } from './ProductCompanionSettings.tsx'
export {
  deriveCompanionActivity, deriveCompanionTasks,
  type CompanionActivity, type CompanionBaseState, type CompanionTask,
} from './activity.ts'
export type {
  CompanionAction, CompanionSize, CompanionSkin, CompanionPosition, CompanionPreferences,
} from './store.ts'
export {
  DEFAULT_COMPANION_NAME, DEFAULT_VOICE_SHORTCUT, persistedCompanionName,
} from './store.ts'
export { insertVoiceText, matchesVoiceShortcut, useVoiceInput, type VoiceStage } from './voice-input.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Cross-page product companion copy. */
    productCompanion: CompanionLocaleKey
  }
}

const NS = 'productCompanion'

function isAuxiliaryWindow(): boolean {
  if (typeof location === 'undefined') return false
  const params = new URLSearchParams(location.search)
  return params.get('dsh-window') === 'auxiliary'
    && (params.get('dsh-window-id')?.trim().length ?? 0) > 0
}

/** Runtime, locale and layout slot services required by the companion. */
export const inject = ['slots', 'sessions', 'uiWorkspace', 'locale']

/** Register one additive, root-scoped companion above every product page. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-product-companion: dictionaries')
  const store = createCompanionStore()
  // Auxiliary DSH windows are independent work surfaces, not extra copies of
  // the user's one digital companion. Settings remain available there, but
  // only the primary window owns the cross-page overlay.
  if (!isAuxiliaryWindow()) {
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'product-companion',
      order: 40,
      locale: NS,
      store,
      inject: () => ({
        startSession: () => { ctx.uiWorkspace.startSession() },
        openSession: (id: SessionId) => { ctx.sessions.open(id) },
      }),
    }, ProductCompanion))
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'product-companion',
    order: 60,
    label: persistedCompanionName,
    locale: NS,
    store,
  }, ProductCompanionSettings))
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon', id: 'product-companion',
  }, props => createElement(FishLogo, { className: props.className, size: 19 })))
}

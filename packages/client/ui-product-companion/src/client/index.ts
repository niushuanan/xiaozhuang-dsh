/** Browser half of the native cross-page product companion plugin. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ProductCompanion } from './ProductCompanion.tsx'
import { ProductCompanionSettings } from './ProductCompanionSettings.tsx'
import { en, zh, type CompanionLocaleKey } from './locales.ts'
import { createCompanionStore } from './store.ts'

export {
  ProductCompanion, companionFrameUrl, type CompanionSequence, type CompanionVisualState,
} from './ProductCompanion.tsx'
export { ProductCompanionSettings } from './ProductCompanionSettings.tsx'
export { deriveCompanionActivity, type CompanionActivity, type CompanionBaseState } from './activity.ts'
export type { CompanionSkin, CompanionPosition, CompanionPreferences } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Cross-page product companion copy. */
    productCompanion: CompanionLocaleKey
  }
}

const NS = 'productCompanion'

/** Runtime, locale and layout slot services required by the companion. */
export const inject = ['slots', 'sessions', 'locale']

/** Register one additive, root-scoped companion above every product page. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-product-companion: dictionaries')
  const store = createCompanionStore()
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'product-companion',
    order: 40,
    locale: NS,
    store,
  }, ProductCompanion))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'product-companion',
    order: 60,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    store,
  }, ProductCompanionSettings))
}

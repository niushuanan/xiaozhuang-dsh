/** Product-owned name beside the sidebar's existing mark. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './ProductBrand.module.css'

type ProductBrandProps = PropsRuntime<'sidebar.brand.name'> & PropsLocale<'xiaozhuangBrand'>

/**
 * Render the product name independently of upstream build metadata.
 * @param props - Slot runtime and product dictionary.
 * @returns Sidebar product name.
 */
export function ProductBrand({ t }: ProductBrandProps) {
  return <span className={css.name}>{t('brand.name')}</span>
}

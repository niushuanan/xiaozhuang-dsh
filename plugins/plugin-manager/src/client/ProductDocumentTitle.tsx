/** Browser metadata for the product-owned brand. */
import { useEffect } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

type ProductDocumentTitleProps = PropsRuntime<'shell.documentTitle'> & PropsLocale<'xiaozhuangBrand'>

/**
 * Keep the selected Session name beside the product name in browser tabs.
 * @param props - Layout-owned Session title and product dictionary.
 * @returns No rendered content.
 */
export function ProductDocumentTitle({ title, t }: ProductDocumentTitleProps): null {
  const productTitle = t('brand.name')
  useEffect(() => {
    document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
    return () => { document.title = productTitle }
  }, [productTitle, title])
  return null
}

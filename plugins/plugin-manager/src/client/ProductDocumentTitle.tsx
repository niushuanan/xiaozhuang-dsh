/** Browser metadata contributed through the frame's document-title seat. */
import { useEffect } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

type ProductDocumentTitleProps = PropsRuntime<'shell.documentTitle'> & PropsLocale<'xiaozhuangBrand'>

/** Keep selected Session names and restore the frame-owned title on unload. */
export function ProductDocumentTitle({ useSessions, usePanelInfo, t, productTitle: nativeTitle }: ProductDocumentTitleProps): null {
  const productTitle = t('brand.name')
  const showSessionTitle = usePanelInfo(info => info.activePanelId === null)
  const title = useSessions(state => showSessionTitle
    ? Object.values(state.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.title
    : undefined)
  useEffect(() => {
    document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
    return () => { document.title = title === undefined ? nativeTitle : `${title} — ${nativeTitle}` }
  }, [productTitle, nativeTitle, title])
  return null
}

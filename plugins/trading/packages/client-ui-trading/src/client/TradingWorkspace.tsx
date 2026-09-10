/** Optional Trading workspace; opening it preserves the native session shell. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { MarketSidebar, type MarketSidebarInjected } from './MarketSidebar.tsx'
import { QuotePane, type QuotePaneInjected } from './QuotePane.tsx'
import { holdingsPanelStore, setHoldingsPanelOpen } from './holdings-store.ts'
import { HoldingsPanel } from './HoldingsPanel.tsx'
import { ScheduledTasksPanel } from './ScheduledTasksPanel.tsx'
import { IconClose, IconWallet } from './icons.tsx'
import { applyColorModeToRoot, colorModeStore } from './color-mode.ts'
import type { Observable } from './store.ts'
import css from './trading-workspace.module.css'

/** Shared workspace visibility contributed to both native slots. */
interface TradingEntryInjected {
  hooks: { open: Observable<boolean> }
  openTrading(): void
}

type TradingEntryProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'dshtrading.market'> & InjectFace<TradingEntryInjected>

/** Sidebar action remains available in both expanded and collapsed navigation. */
export function TradingEntry({ t, wide, useOpen, openTrading }: TradingEntryProps) {
  const open = useOpen(value => value)
  return (
    <button type="button" className={css.entry} data-wide={wide} data-dshtrading-entry=""
      title={t('workspace.title')} aria-label={t('workspace.title')}
      aria-haspopup="dialog" aria-expanded={open} onClick={openTrading}>
      <IconWallet size={18} />
      {wide && <span>{t('workspace.title')}</span>}
    </button>
  )
}

/** Business actions and observable stores owned by the Trading plugin. */
export interface TradingWorkspaceInjected extends Omit<MarketSidebarInjected, 'hooks'>, Omit<QuotePaneInjected, 'hooks'> {
  hooks: MarketSidebarInjected['hooks'] & QuotePaneInjected['hooks'] & { open: Observable<boolean> }
  closeTrading(): void
  openSession(sessionId: string): void
}

type TradingWorkspaceProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<'dshtrading.market'> & InjectFace<TradingWorkspaceInjected>

/** Mount Trading only while requested, so closing also stops view polling. */
export function TradingWorkspace(props: TradingWorkspaceProps) {
  const open = props.useOpen(value => value)
  return open ? <WorkspaceSurface {...props} /> : null
}

function WorkspaceSurface(props: TradingWorkspaceProps) {
  const { t, closeTrading, fillComposer, openSession } = props
  const dialog = useRef<HTMLDialogElement>(null)
  const [section, setSection] = useState<'market' | 'holdings' | 'tasks'>('market')
  const [watchlistOpen, setWatchlistOpen] = useState(false)
  const holdingsOpen = useSyncExternalStore(holdingsPanelStore.subscribe, holdingsPanelStore.getSnapshot)
  const colorMode = useSyncExternalStore(colorModeStore.subscribe, colorModeStore.getSnapshot)

  useEffect(() => {
    const surface = dialog.current
    surface?.showModal()
    return () => { surface?.close() }
  }, [])
  useEffect(() => { applyColorModeToRoot(colorMode) }, [colorMode])

  useEffect(() => {
    if (holdingsOpen) {
      setSection('holdings')
      setWatchlistOpen(false)
      setHoldingsPanelOpen(false)
    }
  }, [holdingsOpen])

  const selectInstrument: TradingWorkspaceInjected['selectInstrument'] = (instrument) => {
    props.selectInstrument(instrument)
    setSection('market')
    setWatchlistOpen(false)
  }

  return (
    <dialog ref={dialog} className={css.surface} data-dshtrading-surface=""
      aria-label={t('workspace.title')} onCancel={closeTrading}>
      <header className={css.header}>
        <strong className={css.title}>{t('workspace.title')}</strong>
        <nav className={css.navigation} aria-label={t('workspace.sections')}>
          <button type="button" data-active={section === 'market'} onClick={() => { setSection('market') }}>
            {t('workspace.market')}
          </button>
          <button type="button" data-active={section === 'holdings'} onClick={() => { setSection('holdings'); setWatchlistOpen(false) }}>
            {t('trade.holdings.panel.title')}
          </button>
          <button type="button" data-active={section === 'tasks'} onClick={() => { setSection('tasks'); setWatchlistOpen(false) }}>
            {t('tasks.open')}
          </button>
        </nav>
        <button type="button" className={css.returnButton} onClick={closeTrading}>
          {t('workspace.backToConversation')}
        </button>
        <button type="button" className={css.closeButton} onClick={closeTrading} aria-label={t('workspace.close')}>
          <IconClose size={18} />
        </button>
      </header>
      {section === 'market' && <button type="button" className={css.watchlistToggle}
        aria-expanded={watchlistOpen} onClick={() => { setWatchlistOpen(value => !value) }}>
        {t(watchlistOpen ? 'workspace.backToQuote' : 'sidebar.expand')}
      </button>}
      <div className={css.body} data-watchlist-open={watchlistOpen} data-section={section}>
        <aside className={css.watchlist} aria-label={t('sidebar.markets')}>
          <MarketSidebar {...props} selectInstrument={selectInstrument} />
        </aside>
        <main className={css.content}>
          {section === 'market' && <QuotePane {...props} />}
          {section === 'holdings' && <HoldingsPanel t={t} fillComposer={fillComposer} onClose={() => { setSection('market') }} />}
          {section === 'tasks' && <ScheduledTasksPanel t={t} openSession={openSession} close={() => { setSection('market') }} />}
        </main>
      </div>
    </dialog>
  )
}

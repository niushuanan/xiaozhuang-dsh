import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
/** Workbench file actions extend the official deliverables and resource seats. */
import { IconCodeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Context } from '../context-types.ts'
import { firstLeaf, revealPaths, togglePanel, type SidebarStore } from './state.ts'
import { t } from './locales.ts'
import { resolveSidebarPath } from './produced-files.ts'
import css from './sidebar.module.css'

/** Open a file in the sidebar's editor (used by the intercepted row and the explorer). */
export function openSidebarFile(ctx: Context, _store: SidebarStore, sessionId: string, path: string): void {
  const summary = ctx.sessions.list.getSnapshot().byId[sessionId as SessionId]
  const absolute = resolveSidebarPath(summary?.cwd, path)
  const at = Math.max(absolute.lastIndexOf('/'), absolute.lastIndexOf('\\'))
  const title = at === -1 ? absolute : absolute.slice(at + 1)
  // Route through the sidebar service so the editor descriptor's dedupeKey
  // (per-path) applies; the id is path-derived so multiple editors coexist.
  ctx.get('betterSidebar')?.openTab({ type: 'editor', title, path: absolute, id: `editor:${absolute}` })
}

/**
 * Reveal the produced files in the sidebar explorer: expand their parent
 * directories, highlight the rows, and focus the explorer tab (expanding the
 * hosting panel when it is collapsed). Unknown files fall back to revealing
 * the workspace root itself.
 */
export function revealInExplorer(
  ctx: Context,
  store: SidebarStore,
  sessionId: string,
  files: readonly string[],
): void {
  const summary = ctx.sessions.list.getSnapshot().byId[sessionId as SessionId]
  const cwd = summary?.cwd
  // Deliverables report paths as-is (often relative to the session cwd), but
  // the explorer tree and revealPaths work on absolute paths — resolve every
  // target so the ancestors expand and the row actually matches.
  const targets = files.length > 0
    ? files.map(path => resolveSidebarPath(cwd, path))
    : cwd === undefined ? [] : [cwd]
  store.reduce(state => revealPaths(state, cwd, targets))
  // A type-only open never auto-expands the panel (only content opens do,
  // see service.openTab) — so a reveal opens the panel itself when it is
  // collapsed, exactly like the subagent auto-open flows, or the highlight
  // would be set on an invisible panel.
  store.reduce(s => (s.panelOpen ? s : togglePanel(s)))
  // Pin the landing to the right panel: the files window must appear where
  // the panel just expanded, not in a bottom-panel pane the user last
  // touched.
  store.reduce(s => ({ ...s, activePane: firstLeaf(s.splits).id }))
  // Focus the single-instance editor home tab (the files window) where the
  // reveal highlight renders. Read via ctx.get like every other internal
  // consumer (#357): the provider is not on this fiber chain, so a direct
  // ctx.betterSidebar read can throw before optional chaining applies.
  ctx.get('betterSidebar')?.openTab({ type: 'editor', title: t('files') })
}

/** The intercepted produced-files row (visual twin of the deliverables chips). */
export function SidebarProducedFiles(props: {
  matched: readonly string[]
  openInSidebar: (path: string) => void
  /** Reveal the produced files in the explorer ("Show in folder" twin). */
  onShowInFolder: (files: readonly string[]) => void
}) {
  const { matched, openInSidebar, onShowInFolder } = props
  const shown = matched.slice(0, 6)
  const hidden = matched.length - shown.length
  return (
    <div className={css.producedRow}>
      <span className={css.producedLabel}>{t('produced')}</span>
      {shown.map((path) => {
        const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
        const name = at === -1 ? path : path.slice(at + 1)
        return (
          <button
            key={path}
            type="button"
            className={css.producedChip}
            title={path}
            onClick={() => { openInSidebar(path) }}
          >
            <IconCodeOutlineRegular size={12} />
            <span>{name}</span>
          </button>
        )
      })}
      {hidden > 0 && <span className={css.producedMore}>+{hidden}</span>}
      {hidden > 0 && (
        <button
          type="button"
          className={css.producedMore}
          style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
          onClick={() => { onShowInFolder(matched) }}
        >
          {t('showInFolder')}
        </button>
      )}
    </div>
  )
}

/** Wait for official per-file list declarations and own their disposal. */
export function registerTurnTailInterception(ctx: Context, store: SidebarStore): () => void {
  // Delivery cards stay owned by the current Harness. Add the workbench's
  // preview/reveal actions to their public per-file action seats.
  const disposers = ['deliverables.file.actions', 'deliverables.review.file.actions'].map(name => (
    ctx.slots.inject(name, () => ctx.slots.register({
      name, id: 'better-sidebar:preview', order: -20,
      inject: (sessionId: string) => ({
        preview: (path: string) => { openSidebarFile(ctx, store, sessionId, path) },
        reveal: (path: string) => { revealInExplorer(ctx, store, sessionId, [path]) },
      }),
    }, (props: { path: string; preview(path: string): void; reveal(path: string): void }) => {
      if (store.getSuspended() || store.getPrefs().tabsEnabled.editor === false) return null
      return <>
        <button type="button" title={t('openFileSide')} onClick={() => { props.preview(props.path) }}>
          <IconCodeOutlineRegular size={14} />
        </button>
        <button type="button" title={t('showInFolder')} onClick={() => { props.reveal(props.path) }}>
          {t('showInFolder')}
        </button>
      </>
    }))
  ))
  return () => { for (const dispose of disposers) dispose() }
}

/** Route Session file resources into the workbench editor when enabled. */
export function registerOpenPathInterception(ctx: Context, store: SidebarStore): () => void {
  const sidebarRight = ctx.get('sidebarRight')
  if (sidebarRight === undefined) throw new Error('the sidebar resource opener is unavailable')
  const original = sidebarRight.openResource
  const wrapped: typeof original = (address, options) => {
    const file = parseFileAddress(address)
    if (!store.getSuspended() && store.getPrefs().interceptOpenPath !== false
      && store.getPrefs().tabsEnabled.editor !== false && file?.scope === 'session') {
      openSidebarFile(ctx, store, file.sessionId, file.path)
      return
    }
    original.call(sidebarRight, address, options)
  }
  sidebarRight.openResource = wrapped
  return () => { if (sidebarRight.openResource === wrapped) sidebarRight.openResource = original }
}

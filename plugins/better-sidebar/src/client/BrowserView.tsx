/**
 * The built-in browser tab: an address bar plus a sandboxed iframe.
 *
 * Security model (see browser.ts + the sandbox tokens below): the iframe is
 * ALWAYS sandboxed without `allow-same-origin` (opaque origin — the visited
 * page can never sit on the GUI's origin, read its storage, or reach
 * /sidebar/api) and without `allow-top-navigation` (a page must not hijack
 * the GUI). The address bar only accepts http(s) and refuses loopback /
 * the GUI's own origin. The side card setting "关闭浏览器沙箱" drops the
 * sandbox attribute entirely for fully trusted sites — the visited page then
 * runs with the GUI's own origin and full session access, so a persistent
 * warning bar renders while it is off.
 *
 * The URL is persisted onto the tab (path/title via the patchTab reducer)
 * so a reload restores the visited page; the back/forward stack only tracks
 * address-bar navigations (in-frame link clicks are cross-origin and
 * invisible — a documented limitation).
 */
import { useEffect, useState } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconLinkOutline14,
  IconRefreshOutline14,
  IconRightUpOutline16,
  IconSearchOutline16,
  IconWarningOutline16,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { api } from './api.ts'
import { embeddabilityOf, isAllowedLoopbackUrl, normalizeBrowserUrl, resolveBrowserInput, type BrowserNavigateResult } from './browser.ts'
import { patchTab } from './state.ts'
import { SandboxStatusBar } from './SandboxStatusBar.tsx'
import { t } from './locales.ts'
import type { BrowserInputMode } from '../prefs-shared.ts'
import type { TabComponentProps } from './service.ts'
import css from './sidebar.module.css'

/**
 * The browser iframe sandbox tokens. NO allow-same-origin (opaque origin —
 * no GUI storage/API access), NO allow-top-navigation (a browsed page must
 * not hijack the GUI). allow-forms/allow-popups/allow-downloads/allow-modals
 * keep login flows working; allow-popups-to-escape-sandbox lets OAuth
 * popups open as normal tabs (they are cross-origin to the GUI either way).
 */
export const BROWSER_IFRAME_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-downloads allow-modals allow-popups-to-escape-sandbox'

/** allow-same-origin appended for explicitly allowlisted local addresses. */
const BROWSER_IFRAME_SANDBOX_SAME_ORIGIN =
  `${BROWSER_IFRAME_SANDBOX} allow-same-origin`

/**
 * The sandbox tokens for one URL: allowlisted loopback addresses (local dev
 * servers the user explicitly trusts) additionally get `allow-same-origin`
 * so Vite/module/HMR pipelines that need a real origin work; every other
 * site keeps the opaque-origin sandbox. `allow-same-origin` does NOT give
 * the page access to the GUI — it stays cross-origin to it and to every
 * other site — but it does give it its OWN origin privileges (localStorage,
 * fetch without CORS), so it is only granted for the explicit allowlist.
 *
 * The GUI itself is the one hard exception: even when its own host is
 * allowlisted (a bare-host entry covers every port, so the GUI origin
 * matches), a page at the GUI's exact origin must never get
 * `allow-same-origin` — that would make it same-origin with its parent and
 * hand it the GUI's storage/API (and the ability to shed the sandbox). The
 * GUI keeps the opaque-origin sandbox no matter what the allowlist says.
 */
export function iframeSandboxFor(url: string | undefined, allowedLoopback: string, selfOrigin?: string): string | undefined {
  if (url === undefined) return undefined
  if (selfOrigin !== undefined) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return BROWSER_IFRAME_SANDBOX
    }
    if (parsed.origin === selfOrigin) return BROWSER_IFRAME_SANDBOX
  }
  return isAllowedLoopbackUrl(url, allowedLoopback)
    ? BROWSER_IFRAME_SANDBOX_SAME_ORIGIN
    : BROWSER_IFRAME_SANDBOX
}

/** A navigation result the address bar refused (blocked or invalid). */
type RefusedNavigateResult = Exclude<BrowserNavigateResult, { kind: 'ok' }>

/** The address-bar message for a refused navigation result. */
function browserBlockMessage(result: RefusedNavigateResult): string {
  return result.kind === 'invalid'
    ? t('browserInvalid')
    : result.reason === 'scheme' ? t('browserBlockedScheme')
      : t('browserBlockedLoopback')
}

/** One address-bar navigation, including the text/mode the user saw. */
interface BrowserHistoryEntry {
  url: string
  input: string
  mode: BrowserInputMode
}

export function BrowserView(props: TabComponentProps) {
  const { store, tab } = props
  // Defense in depth: a persisted tab.path must pass the SAME address-bar
  // gate every user navigation passes through. A seed the browser would
  // refuse (non-http(s) or unallowlisted loopback) renders the block message
  // instead of loading the iframe.
  const seed = tab.path !== undefined
    ? normalizeBrowserUrl(tab.path, window.location.origin, store.getPrefs().browserAllowedLoopback)
    : null
  const seedUrl = seed !== null && seed.kind === 'ok' ? seed.url : undefined
  const seedMessage = seed !== null && seed.kind !== 'ok' ? browserBlockMessage(seed) : null
  const [url, setUrl] = useState<string | undefined>(seedUrl)
  const [input, setInput] = useState<string>(tab.path ?? '')
  // A restored path is unambiguously a URL. The configurable default applies
  // only to a fresh browser tab, which avoids re-searching a persisted URL.
  const [mode, setMode] = useState<BrowserInputMode>(
    tab.path === undefined ? store.getPrefs().browserDefaultMode : 'url',
  )
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  /** Blocked/invalid hint shown under the address bar (null = none). */
  const [message, setMessage] = useState<string | null>(seedMessage)
  /** Address-bar navigation history (in-frame clicks are not tracked). */
  const [history, setHistory] = useState<BrowserHistoryEntry[]>(seedUrl !== undefined
    ? [{ url: seedUrl, input: seedUrl, mode: 'url' }]
    : [])
  const [cursor, setCursor] = useState<number>(seedUrl !== undefined ? 0 : -1)
  /** Bumped on reload to remount the iframe (also remounts on sandbox flip). */
  const [reloadKey, setReloadKey] = useState(0)
  /** TEMPORARY sandbox unlock for THIS surface only (never writes the global
   *  side card setting; lasts until the tab unmounts or the user restores). */
  const [localUnlock, setLocalUnlock] = useState(false)
  const noSandbox = store.getPrefs().browserNoSandbox === true || localUnlock
  /** A site that refuses to be embedded (X-Frame-Options / frame-ancestors):
   *  the probe verdict shown instead of the blank iframe. */
  const [embedBlocked, setEmbedBlocked] = useState<string | null>(null)

  // Probe every navigation (address bar, history, restored path): when the
  // target forbids embedding, show the reason + open-in-browser instead of
  // the browser's cryptic "refused to connect" blank frame. A failed probe
  // (unreachable) keeps the plain iframe.
  useEffect(() => {
    if (url === undefined) return
    let cancelled = false
    setEmbedBlocked(null)
    void api.browserProbe(url).then((probe) => {
      if (!cancelled && embeddabilityOf(probe) === 'blocked') setEmbedBlocked(url)
    }).catch(() => { /* unreachable: keep the plain iframe */ })
    return () => { cancelled = true }
  }, [url])

  const persist = (nextUrl: string): void => {
    let host = nextUrl
    try { host = new URL(nextUrl).hostname } catch { /* keep the URL as title */ }
    store.reduce(state => patchTab(state, tab.id, { path: nextUrl, title: host }))
  }

  const navigateTo = (raw: string): void => {
    const result = resolveBrowserInput(raw, mode, window.location.origin, store.getPrefs().browserAllowedLoopback)
    if (result.kind === 'ok') {
      const next = result.url
      const nextInput = mode === 'search' ? raw.trim() : next
      const entry: BrowserHistoryEntry = { url: next, input: nextInput, mode }
      setUrl(next)
      setInput(nextInput)
      setMessage(null)
      // Push onto the stack, dropping any stale forward entries.
      setHistory(previous => [...previous.slice(0, cursor + 1), entry])
      setCursor(previous => previous + 1)
      setReloadKey(key => key + 1)
      persist(next)
      return
    }
    setMessage(browserBlockMessage(result))
  }

  const goBack = (): void => {
    if (cursor <= 0) return
    // oxlint-disable-next-line typescript/no-non-null-assertion -- narrow: value is guarded by the enclosing control flow.
    const next = history[cursor - 1]!
    setCursor(cursor - 1)
    setUrl(next.url)
    setInput(next.input)
    setMode(next.mode)
    setReloadKey(key => key + 1)
  }

  const goForward = (): void => {
    if (cursor >= history.length - 1) return
    // oxlint-disable-next-line typescript/no-non-null-assertion -- narrow: value is guarded by the enclosing control flow.
    const next = history[cursor + 1]!
    setCursor(cursor + 1)
    setUrl(next.url)
    setInput(next.input)
    setMode(next.mode)
    setReloadKey(key => key + 1)
  }

  return (
    <div className={css.browser}>
      <div className={css.browserBar}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserBack')}
          title={t('browserBack')}
          disabled={cursor <= 0}
          onClick={goBack}
        >
          <IconChevronLeftOutline14 />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserForward')}
          title={t('browserForward')}
          disabled={cursor >= history.length - 1}
          onClick={goForward}
        >
          <IconChevronRightOutline14 />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('refresh')}
          title={t('refresh')}
          onClick={() => { setReloadKey(key => key + 1) }}
        >
          <IconRefreshOutline14 />
        </button>
        <div className={css.browserOmnibox}>
          <input
            className={css.browserInput}
            value={input}
            aria-label={mode === 'url' ? t('browserPlaceholder') : t('browserSearchPlaceholder')}
            placeholder={mode === 'url' ? t('browserPlaceholder') : t('browserSearchPlaceholder')}
            spellCheck={mode === 'search'}
            onChange={(event) => { setInput(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') navigateTo(input)
            }}
          />
          <Menu
            open={modeMenuOpen}
            onClose={() => { setModeMenuOpen(false) }}
            items={[
              { id: 'url', label: t('browserModeUrl') },
              { id: 'search', label: t('browserModeSearch') },
            ]}
            selectedId={mode}
            onSelect={(id) => {
              setMode(id === 'search' ? 'search' : 'url')
              setMessage(null)
              setModeMenuOpen(false)
            }}
            portal
            compact
            align="end"
            anchor={(
              <button
                type="button"
                className={css.browserModeButton}
                aria-label={t('browserModeAria', {
                  mode: mode === 'url' ? t('browserModeUrl') : t('browserModeSearch'),
                })}
                aria-haspopup="menu"
                aria-expanded={modeMenuOpen}
                onClick={() => { setModeMenuOpen(open => !open) }}
              >
                <span>{mode === 'url' ? t('browserModeUrl') : t('browserModeSearch')}</span>
                <IconChevronDownOutline14 size={12} />
              </button>
            )}
          />
        </div>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserGo')}
          title={t('browserGo')}
          onClick={() => { navigateTo(input) }}
        >
          {mode === 'url' ? <IconLinkOutline14 /> : <IconSearchOutline16 size={14} />}
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserOpenExternal')}
          title={t('browserOpenExternal')}
          disabled={url === undefined}
          onClick={() => {
            if (url !== undefined) window.open(url, '_blank', 'noopener')
          }}
        >
          <IconRightUpOutline16 size={15} />
        </button>
      </div>
      {message !== null && <div className={css.browserMessage}>{message}</div>}
      <SandboxStatusBar
        sandboxed={!noSandbox}
        local={localUnlock}
        dangerCopy={t('browserNoSandboxWarning')}
        onUnlock={() => { setLocalUnlock(true) }}
        onRestore={() => { setLocalUnlock(false) }}
      />
      {url === undefined ? (
        <div className={css.browserStart}>{t('browserStart')}</div>
      ) : embedBlocked !== null ? (
        <BrowserEmbedBlocked
          url={embedBlocked}
          onOpenInBrowser={() => { window.open(embedBlocked, '_blank', 'noopener') }}
        />
      ) : (
        <iframe
          key={`${reloadKey}:${noSandbox ? 'ns' : 'sb'}`}
          className={css.browserFrame}
          src={url}
          sandbox={noSandbox ? undefined : iframeSandboxFor(url, store.getPrefs().browserAllowedLoopback, window.location.origin)}
          referrerPolicy="no-referrer"
          allow=""
          title={url}
        />
      )}
    </div>
  )
}

/**
 * The embed-refusal panel: shown when the probed site forbids being
 * displayed inside other pages (X-Frame-Options / frame-ancestors) — the
 * iframe would only show the browser's "refused to connect" blank. Explains
 * the reason and offers the only effective fallback: the system browser.
 * Exported so the copy and the actions are testable without a DOM.
 */
export function BrowserEmbedBlocked(props: {
  url: string
  onOpenInBrowser: () => void
}) {
  const { url, onOpenInBrowser } = props
  let host = url
  try { host = new URL(url).hostname } catch { /* keep the raw URL */ }
  return (
    <div className={css.browserBlocked}>
      <IconWarningOutline16 size={16} />
      <div className={css.browserBlockedTitle}>{t('browserEmbedBlocked', { host })}</div>
      <div className={css.browserBlockedDesc}>{t('browserEmbedBlockedDesc')}</div>
      <div className={css.browserBlockedActions}>
        <button type="button" className={css.browserBlockedButton} onClick={onOpenInBrowser}>
          {t('browserOpenExternal')}
        </button>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  IconChevronDownOutline14,
  IconDataOutline16,
  IconRefreshOutline16,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { BRAND_LOGOS } from './brandAssets.ts'
import { NS } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './QuotaAction.module.css'

/** Full props for the session-header provider-quota action. */
export type QuotaActionProps =
  PropsRuntime<'conversation.session.header.actions'> & PropsLocale<typeof NS>

interface QuotaRow {
  key: string
  used?: number
  limit?: number
  percentUsed?: number
  resetAt?: string
}

interface ProviderReport {
  id: string
  name: string
  kind: 'money' | 'quota'
  status: 'ok' | 'no-key' | 'error'
  plan?: string
  money?: { currency: string; total: number; toppedUp?: number; granted?: number }
  quotas?: QuotaRow[]
  error?: string
}

interface UsageSnapshot {
  updatedAt: number
  providers: ProviderReport[]
}

const API_URL = '/plugins/ui-provider-quota/api/usage'
const AUTO_REFRESH_MS = 5 * 60_000

function rowPercent(row: QuotaRow | undefined): number | undefined {
  if (row === undefined) return undefined
  if (typeof row.percentUsed === 'number') return row.percentUsed
  if (typeof row.used === 'number' && typeof row.limit === 'number' && row.limit > 0) {
    return (row.used / row.limit) * 100
  }
  return undefined
}

function windowRow(provider: ProviderReport, key: 'rolling-5h' | 'weekly'): QuotaRow | undefined {
  const aliases = key === 'rolling-5h' ? new Set(['rolling-5h', 'tokens-5h']) : new Set(['weekly', 'tokens-weekly'])
  return provider.quotas?.find(row => aliases.has(row.key))
}

function formatMoney(currency: string, amount: number): string {
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency + ' '
  return symbol + amount.toFixed(2)
}

function formatResetAt(resetAt: string | undefined, percent: number | undefined, t: TranslateNS<typeof NS>): string {
  if (resetAt === undefined) {
    return percent === 0 ? t('quota.reset.unused') : t('quota.reset.unknown')
  }
  const date = new Date(/^\d+$/.test(resetAt) ? Number(resetAt) : resetAt)
  if (Number.isNaN(date.getTime())) return t('quota.reset.unknown')
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find(part => part.type === type)?.value ?? ''
  return t('quota.reset.at', {
    time: `${value('month')}/${value('day')} ${value('hour')}:${value('minute')}`,
  })
}

function WindowMetric({ label, row, t }: {
  label: string
  row: QuotaRow | undefined
  t: TranslateNS<typeof NS>
}) {
  const percent = rowPercent(row)
  const percentText = percent === undefined ? t('quota.not-reported') : t('quota.percent', { percent: Math.round(percent) })
  const resetText = formatResetAt(row?.resetAt, percent, t)
  return (
    <div className={css.metric} data-unused={percent === 0 ? 'true' : undefined}>
      <div className={css.metricTop}>
        <span className={css.metricLabel}>{label}</span>
        <span className={percent === undefined ? css.metricMissing : css.metricValue}>
          {percentText}
        </span>
      </div>
      <div
        className={css.bar}
        role="progressbar"
        aria-label={`${label}，${percentText}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === undefined ? undefined : Math.round(percent)}
      >
        {percent === undefined || percent === 0
          ? null
          : <div className={css.barFill} style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }} />}
      </div>
      <span className={css.resetTime}>{resetText}</span>
    </div>
  )
}

function displayPlan(provider: ProviderReport): string | undefined {
  if (provider.id === 'kimi') {
    if (provider.plan === 'LEVEL_ADVANCED') return 'ALLEGRO'
    return provider.plan?.replace(/^LEVEL_/, '').toUpperCase()
  }
  if (provider.id === 'zai') return provider.plan?.toUpperCase()
  if (provider.id === 'codex') return provider.plan?.toLowerCase() === 'pro' ? 'PRO · 20X' : provider.plan?.toUpperCase()
  return undefined
}

function ProviderCard({ provider, t }: { provider: ProviderReport; t: TranslateNS<typeof NS> }) {
  const fiveHour = windowRow(provider, 'rolling-5h')
  const weekly = windowRow(provider, 'weekly')
  const displayName = provider.id === 'kimi' ? 'KIMI' : provider.id === 'zai' ? 'GLM' : provider.id === 'codex' ? 'GPT' : provider.name
  const plan = displayPlan(provider)
  const logo = BRAND_LOGOS[provider.id]

  return (
    <article className={css.providerCard} role="listitem">
      <div className={css.cardTop}>
        <span className={css.logoFrame} data-provider-id={provider.id}>
          {logo === undefined ? null : <img className={css.logo} src={logo} alt="" />}
        </span>
        <span className={css.providerName}>{displayName}</span>
        {plan === undefined ? null : <span className={css.planBadge}>{plan}</span>}
      </div>

      {provider.status !== 'ok'
        ? (
          <div className={css.providerMessage} title={provider.error}>
            <span>{provider.status === 'no-key' ? t('status.no-key') : t('status.error')}</span>
            <small>{provider.status === 'no-key' ? t('status.connect') : t('status.retry')}</small>
          </div>
        )
        : provider.money !== undefined
          ? (
            <div className={css.moneyMetric}>
              <span className={css.metricLabel}>{t('money.total')}</span>
              <span className={css.moneyValue}>{formatMoney(provider.money.currency, provider.money.total)}</span>
            </div>
          )
          : (
            <div className={provider.id === 'codex' ? css.metricsSingle : css.metrics}>
              {provider.id === 'codex' ? null : <WindowMetric label={t('quota.rolling-5h')} row={fiveHour} t={t} />}
              <WindowMetric label={t('quota.weekly')} row={weekly} t={t} />
            </div>
          )}
    </article>
  )
}

/** Four-provider usage panel with live refresh and a five-minute open-state poll. */
export function QuotaAction({ t }: QuotaActionProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<UsageSnapshot | undefined>()
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inflightRef = useRef(false)

  useDismissOnOutsidePointer(rootRef, open, setOpen)

  const load = useCallback(async (force: boolean, showLoading = false) => {
    if (inflightRef.current) return
    inflightRef.current = true
    if (showLoading) setLoading(true)
    try {
      const resp = await fetch(API_URL + (force ? '?force=1' : ''), { cache: 'no-store' })
      if (!resp.ok) throw new Error('HTTP ' + String(resp.status))
      setData(await resp.json() as UsageSnapshot)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      inflightRef.current = false
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const timer = window.setInterval(() => { void load(true) }, AUTO_REFRESH_MS)
    return () => { window.clearInterval(timer) }
  }, [load, open])

  const close = (): void => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    close()
  }
  const updatedAt = data === undefined
    ? undefined
    : new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={t('trigger.aria')}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next && data === undefined) void load(false, true)
        }}
      >
        <IconDataOutline16 className={css.triggerIcon} size={14} />
        <span className={css.count}>{t('trigger.label')}</span>
        <IconChevronDownOutline14 className={open ? css.triggerOpen : undefined} />
      </button>

      {open
        ? (
          <section className={css.panel} role="dialog" aria-label={t('panel.aria')}>
            <header className={css.panelHeader}>
              <h2 className={css.title}>{t('panel.title')}</h2>
              <span className={css.autoRefresh}>{t('auto-refresh')}</span>
              <button
                type="button"
                className={css.iconButton}
                aria-label={t('refresh')}
                disabled={loading}
                onClick={() => { void load(true, true) }}
              >
                <span className={loading ? css.refreshSpin : undefined}>
                  <IconRefreshOutline16 size={20} />
                </span>
              </button>
            </header>

            <div
              className={css.providerList}
              role="list"
              data-populated={data?.providers.length ? 'true' : undefined}
            >
              {data === undefined && !loadError
                ? <div className={css.stateLine}>{t('refreshing')}</div>
                : null}
              {loadError && data === undefined
                ? <div className={css.stateLine}>{t('load.error')}</div>
                : null}
              {data?.providers.map(provider => <ProviderCard key={provider.id} provider={provider} t={t} />)}
            </div>

            <footer className={css.footer}>
              <span>{updatedAt === undefined ? t('refreshing') : t('updated.at', { time: updatedAt })}</span>
              <span aria-hidden="true">·</span>
              <span>{t('reset.timezone')}</span>
              {loadError && data !== undefined ? <span className={css.inlineError}>{t('refresh.failed')}</span> : null}
            </footer>
          </section>
        )
        : null}
    </div>
  )
}

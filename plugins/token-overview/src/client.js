/** Token Overview, browser half: a Settings-only whole-machine usage view. */
window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-token-overview',
  factory: (require) => {
    const React = require('react')
    const { IconRightUpOutline14, IconUsageTrendOutline16, SettingsSectionHeader: SharedSettingsSectionHeader } = require('@deepseek-ai/dsh-client-ui-primitives')
    const SettingsSectionHeader = SharedSettingsSectionHeader ?? function SettingsSectionHeaderFallback(props) {
      return React.createElement('header', { 'data-settings-section-header': 'true', style: { display: 'grid', gap: '4px', margin: '0 0 24px' } },
        React.createElement('h2', { style: { margin: 0, fontSize: '20px', lineHeight: '28px', fontWeight: 600 } }, props.title),
        props.description ? React.createElement('p', { style: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: '20px' } }, props.description) : null)
    }

    const API_URL = '/plugins/token-overview/api/status'
    const POLL_MS = 30_000
    const RANGE_OPTIONS = [
      { id: 'today', label: '今日' },
      { id: 'week', label: '近 7 天' },
      { id: 'month', label: '本月' },
      { id: 'all', label: '全部' },
    ]

    const CSS = [
      '.to-root { box-sizing:border-box; container-type:inline-size; width:100%; max-width:760px; padding:0 0 36px; color:var(--dsw-alias-label-primary); }',
      '.to-root * { box-sizing:border-box; }',
      '.to-freshness { margin-top:2px; color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:16px; }',
      '.to-ranges { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:3px; width:min(100%,372px); margin:4px 0 19px; padding:3px; border-radius:12px; background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent); }',
      '.to-range { height:30px; padding:0 11px; border:0; border-radius:9px; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:11px; cursor:pointer; transition:background-color .12s ease,color .12s ease; }',
      '.to-range:hover { color:var(--dsw-alias-label-primary); background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent); }',
      '.to-range:focus-visible { outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 32%,transparent); outline-offset:1px; }',
      '.to-range[aria-pressed="true"] { background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-1); font-weight:600; }',
      '.to-summary { margin:0; }',
      '.to-summary-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:9px; }',
      '.to-eyebrow { color:var(--dsw-alias-label-secondary); font-size:11px; line-height:17px; font-weight:650; }',
      '.to-period { color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:14px; text-align:right; }',
      '.to-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }',
      '.to-kpi { min-width:0; min-height:82px; padding:12px 13px 11px; border-radius:12px; background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,var(--dsw-alias-bg-layer-1)); }',
      '.to-kpi-label { color:var(--dsw-alias-label-secondary); font-size:10px; line-height:15px; }',
      '.to-kpi-value { margin-top:4px; overflow:hidden; font-size:19px; line-height:25px; font-weight:700; letter-spacing:-.025em; font-variant-numeric:tabular-nums; text-overflow:ellipsis; white-space:nowrap; }',
      '.to-kpi-note { margin-top:2px; overflow:hidden; color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:14px; text-overflow:ellipsis; white-space:nowrap; }',
      '.to-breakdown-wrap { margin-top:8px; padding:12px 13px; border-radius:12px; background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,var(--dsw-alias-bg-layer-1)); }',
      '.to-breakdown-label { margin-bottom:8px; color:var(--dsw-alias-label-secondary); font-size:10px; line-height:15px; font-weight:620; }',
      '.to-breakdown { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; }',
      '.to-breakdown-item { min-width:0; }',
      '.to-breakdown-item span { display:block; color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:14px; }',
      '.to-breakdown-item strong { display:block; margin-top:2px; overflow:hidden; font-size:11px; line-height:17px; font-weight:620; font-variant-numeric:tabular-nums; text-overflow:ellipsis; white-space:nowrap; }',
      '.to-section,.to-ranking { margin-top:24px; }',
      '.to-section-title { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin:0 0 9px; font-size:13px; line-height:19px; font-weight:650; }',
      '.to-section-title small { color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:14px; font-weight:400; text-align:right; }',
      '.to-trend-panel { padding:13px 13px 11px; border-radius:14px; background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,var(--dsw-alias-bg-layer-1)); }',
      '.to-trend-tooltip { display:grid; grid-template-columns:minmax(68px,.8fr) minmax(104px,1.35fr) minmax(94px,1.2fr) minmax(60px,.7fr) minmax(70px,.78fr); gap:9px; align-items:end; min-height:42px; margin-bottom:10px; padding:0 1px 10px; border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 15%,transparent); }',
      '.to-tooltip-cell { min-width:0; }',
      '.to-tooltip-cell span { display:block; color:var(--dsw-alias-label-tertiary); font-size:8px; line-height:13px; }',
      '.to-tooltip-cell strong { display:block; margin-top:1px; overflow:hidden; color:var(--dsw-alias-label-secondary); font-size:10px; line-height:16px; font-weight:620; font-variant-numeric:tabular-nums; text-overflow:ellipsis; white-space:nowrap; }',
      '.to-tooltip-cell:first-child strong { color:var(--dsw-alias-label-primary); font-size:11px; }',
      '.to-bars-scroll { overflow-x:auto; padding-bottom:1px; scrollbar-width:thin; }',
      '.to-bars { display:grid; grid-template-columns:repeat(var(--to-count),minmax(24px,1fr)); gap:6px; align-items:end; min-width:max(100%,calc(var(--to-count) * 30px)); height:111px; }',
      '.to-bar-col { display:grid; grid-template-rows:86px 17px; gap:5px; min-width:0; margin:0; padding:0; border:0; background:transparent; color:inherit; font:inherit; cursor:crosshair; }',
      '.to-bar-col:focus-visible { outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent); outline-offset:2px; border-radius:7px; }',
      '.to-bar-track { position:relative; display:flex; align-items:flex-end; width:100%; height:86px; overflow:hidden; border-radius:6px 6px 3px 3px; background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent); transition:background-color .1s ease; }',
      '.to-bar-fill { display:block; width:100%; height:var(--to-height); border-radius:6px 6px 2px 2px; background:#3d70ee; transition:filter .1s ease,transform .1s ease; transform-origin:bottom; }',
      '.to-bar-fill[data-empty="true"] { height:0; }',
      '.to-bar-col:hover .to-bar-track,.to-bar-col[aria-pressed="true"] .to-bar-track { background:color-mix(in srgb,#3d70ee 13%,var(--dsw-alias-bg-layer-1)); }',
      '.to-bar-col:hover .to-bar-fill,.to-bar-col[aria-pressed="true"] .to-bar-fill { filter:saturate(1.1) brightness(.96); transform:scaleX(.94); }',
      '.to-bar-label { overflow:hidden; color:var(--dsw-alias-label-tertiary); font-size:8px; line-height:13px; font-variant-numeric:tabular-nums; text-align:center; text-overflow:clip; white-space:nowrap; }',
      '.to-list-card { overflow:hidden; padding:0 13px; border-radius:14px; background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,var(--dsw-alias-bg-layer-1)); }',
      '.to-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; align-items:center; min-height:50px; padding:8px 0; }',
      '.to-row + .to-row { border-top:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 13%,transparent); }',
      '.to-row-main { min-width:0; }',
      '.to-row-name { overflow:hidden; font-size:11px; line-height:17px; font-weight:620; text-overflow:ellipsis; white-space:nowrap; }',
      '.to-row-meta { overflow:hidden; color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:14px; text-overflow:ellipsis; white-space:nowrap; }',
      '.to-row-stats { display:grid; grid-template-columns:repeat(4,72px); gap:12px; }',
      '.to-row-stat { min-width:0; text-align:right; }',
      '.to-row-stat span { display:block; color:var(--dsw-alias-label-tertiary); font-size:8px; line-height:12px; }',
      '.to-row-stat strong { display:block; margin-top:1px; color:var(--dsw-alias-label-secondary); font-size:10px; line-height:16px; font-weight:580; font-variant-numeric:tabular-nums; white-space:nowrap; }',
      '.to-coverage-card { padding:13px; border-radius:14px; background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,var(--dsw-alias-bg-layer-1)); }',
      '.to-coverage { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); }',
      '.to-coverage-item { min-width:0; padding:1px 12px; }',
      '.to-coverage-item:first-child { padding-left:0; }',
      '.to-coverage-item:last-child { padding-right:0; }',
      '.to-coverage-item + .to-coverage-item { border-left:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 15%,transparent); }',
      '.to-coverage-item span { display:block; color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:14px; }',
      '.to-coverage-item strong { display:block; margin-top:3px; overflow:hidden; font-size:14px; line-height:20px; font-weight:650; font-variant-numeric:tabular-nums; text-overflow:ellipsis; white-space:nowrap; }',
      '.to-method { margin:10px 1px 0; color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:15px; }',
      '.to-warnings { margin:9px 0 0; padding-left:16px; color:var(--dsw-alias-red-primary,#b42318); font-size:9px; line-height:15px; }',
      '.to-detail { display:flex; align-items:center; gap:18px; margin-top:24px; padding:13px 14px; border:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 15%,transparent); border-radius:13px; background:var(--dsw-alias-bg-layer-1); }',
      '.to-detail-main { flex:1; min-width:0; }',
      '.to-detail-title { margin:0; font-size:11px; line-height:17px; font-weight:650; }',
      '.to-detail-copy { margin:2px 0 0; color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:15px; }',
      '.to-report-link { display:inline-flex; align-items:center; justify-content:center; gap:5px; flex:none; min-height:29px; padding:0 11px; border-radius:9px; background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-1); font-size:10px; line-height:16px; font-weight:600; text-decoration:none; }',
      '.to-report-link:hover { opacity:.86; }',
      '.to-report-link:focus-visible { outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 38%,transparent); outline-offset:2px; }',
      '.to-report-link svg { width:10px; height:10px; }',
      '.to-source { margin:11px 2px 0; color:var(--dsw-alias-label-tertiary); font-size:8px; line-height:14px; }',
      '.to-empty,.to-error { margin-top:12px; padding:38px 20px; border-radius:14px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); font-size:11px; line-height:18px; text-align:center; }',
      '.to-error { color:var(--dsw-alias-red-primary,#b42318); }',
      '@container (max-width:520px) { .to-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } .to-breakdown { grid-template-columns:repeat(3,minmax(0,1fr)); } .to-trend-tooltip { grid-template-columns:repeat(2,minmax(0,1fr)); } .to-tooltip-cell:first-child { grid-column:1/-1; } .to-row { grid-template-columns:1fr; gap:6px; padding:10px 0; } .to-row-stats { grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; } .to-row-stat { text-align:left; } .to-coverage { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 0; } .to-coverage-item:nth-child(3) { padding-left:0; border-left:0; } .to-coverage-item:nth-child(2) { padding-right:0; } .to-coverage-item:nth-child(n+3) { padding-top:10px; border-top:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 13%,transparent); } }',
      '@container (max-width:380px) { .to-range { padding:0 6px; } .to-breakdown { grid-template-columns:repeat(2,minmax(0,1fr)); } .to-detail { align-items:flex-start; flex-direction:column; gap:10px; } .to-report-link { width:100%; } }',
      '@media (prefers-reduced-motion:reduce) { .to-range,.to-bar-track,.to-bar-fill { animation:none !important; transition:none !important; } }',
    ].join('\n')

    function compact(value) {
      const number = Number(value) || 0
      const abs = Math.abs(number)
      if (abs >= 1e12) return (number / 1e12).toFixed(abs >= 1e13 ? 1 : 2) + 'T'
      if (abs >= 1e9) return (number / 1e9).toFixed(abs >= 1e10 ? 1 : 2) + 'B'
      if (abs >= 1e6) return (number / 1e6).toFixed(abs >= 1e7 ? 1 : 2) + 'M'
      if (abs >= 1e3) return (number / 1e3).toFixed(abs >= 1e4 ? 1 : 2) + 'K'
      return Math.round(number).toLocaleString('zh-CN')
    }

    function exact(value) { return (Number(value) || 0).toLocaleString('zh-CN') }
    function percent(value) { return ((Number(value) || 0) * 100).toFixed(1) + '%' }
    function money(value) { return '$' + Math.round(Number(value) || 0).toLocaleString('en-US') }
    function clock(value) {
      if (typeof value !== 'number') return '等待首份数据'
      return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    function rangeCopy(rangeId, range) {
      if (rangeId === 'today') return '今日 00:00 至当前'
      const start = range?.start
      const end = range?.end
      if (typeof start !== 'string' || typeof end !== 'string') return '统计区间'
      if (rangeId === 'all') return `${start} 至 ${end}`
      return `${start.slice(5)} 至 ${end.slice(5)}`
    }

    function Kpi({ label, value, note }) {
      return React.createElement('div', { className: 'to-kpi' },
        React.createElement('div', { className: 'to-kpi-label' }, label),
        React.createElement('div', { className: 'to-kpi-value' }, value),
        React.createElement('div', { className: 'to-kpi-note' }, note))
    }

    function Breakdown({ metrics }) {
      const items = [
        ['输入', compact(metrics.inputTokens)], ['输出', compact(metrics.outputTokens)],
        ['缓存读取', compact(metrics.cacheReadTokens)], ['缓存写入', compact(metrics.cacheWriteTokens)],
        ['缓存占比', percent(metrics.cacheRatio)], ['推理明细', compact(metrics.reasoningTokens)],
      ]
      return React.createElement('div', { className: 'to-breakdown-wrap', 'aria-label': 'Token 构成' },
        React.createElement('div', { className: 'to-breakdown-label' }, 'Token 构成'),
        React.createElement('div', { className: 'to-breakdown' }, items.map(([label, value]) =>
          React.createElement('div', { className: 'to-breakdown-item', key: label },
            React.createElement('span', null, label), React.createElement('strong', null, value)))))
    }

    function Trend({ range, rangeId, updatedAt }) {
      const rows = range.trend ?? []
      const max = Math.max(1, ...rows.map(item => Number(item.processedTokens) || 0))
      const total = Number(range.metrics?.processedTokens) || rows.reduce((sum, item) => sum + (Number(item.processedTokens) || 0), 0)
      const initialIndex = Math.max(0, rows.reduce((last, item, index) => (Number(item.processedTokens) || 0) > 0 ? index : last, 0))
      const [activeIndex, setActiveIndex] = React.useState(initialIndex)
      React.useEffect(() => { setActiveIndex(initialIndex) }, [rangeId, rows.length])
      const active = rows[Math.min(activeIndex, Math.max(0, rows.length - 1))] ?? {}
      const tooltipItems = [
        ['时间', active.label ?? active.date ?? '暂无数据'],
        ['处理量（Token）', exact(active.processedTokens)],
        ['非缓存（Token）', exact(active.nonCacheTokens)],
        ['调用', exact(active.calls) + ' 次'],
        ['成本', money(active.cost)],
      ]
      return React.createElement('section', { className: 'to-section' },
        React.createElement('h3', { className: 'to-section-title' }, '用量趋势',
          React.createElement('small', null, `${range.trendMeta?.label ?? '处理量'} · 合计 ${compact(total)}`)),
        React.createElement('div', { className: 'to-trend-panel' },
          React.createElement('div', { className: 'to-trend-tooltip', role: 'status', 'aria-live': 'polite', 'data-trend-tooltip': '' }, tooltipItems.map(([label, value]) =>
            React.createElement('div', { className: 'to-tooltip-cell', key: label }, React.createElement('span', null, label), React.createElement('strong', null, value)))),
          React.createElement('div', { className: 'to-bars-scroll' },
            React.createElement('div', { className: 'to-bars', role: 'group', 'aria-label': range.trendMeta?.ariaLabel ?? 'Token 处理量柱状图', style: { '--to-count': Math.max(1, rows.length) } },
              rows.map((item, index) => {
                const value = Number(item.processedTokens) || 0
                const height = value > 0 ? Math.max(4, Math.round(value / max * 86)) : 0
                const showLabel = rangeId !== 'month' || index % 3 === 0 || index === rows.length - 1
                const label = item.label ?? item.date ?? `第 ${index + 1} 项`
                const aria = `${label}，处理量 ${exact(value)} Token，非缓存 ${exact(item.nonCacheTokens)} Token，调用 ${exact(item.calls)} 次，成本 ${money(item.cost)}`
                return React.createElement('button', {
                  type: 'button', className: 'to-bar-col', key: item.date ?? index,
                  'aria-label': aria, 'aria-pressed': activeIndex === index,
                  onPointerEnter: () => setActiveIndex(index), onFocus: () => setActiveIndex(index), onClick: () => setActiveIndex(index),
                },
                  React.createElement('span', { className: 'to-bar-track', 'aria-hidden': true },
                    React.createElement('span', { className: 'to-bar-fill', 'data-empty': value === 0, style: { '--to-height': height + 'px' } })),
                  React.createElement('span', { className: 'to-bar-label', 'aria-hidden': true }, showLabel ? item.label : ''))
              })))),
        rangeId === 'today' ? React.createElement('p', { className: 'to-method' }, `今日 24 小时按北京时间分为 8 个区间，每 3 小时一柱；未发生用量的时段保持灰色。移动鼠标或使用键盘聚焦任一柱即可查看精确数据。数据更新于 ${clock(updatedAt)}。`) : null)
    }

    function RankedList({ title, rows, model }) {
      return React.createElement('section', { className: 'to-ranking' },
        React.createElement('h3', { className: 'to-section-title' }, title,
          React.createElement('small', null, `共 ${rows.length} 项 · 按处理量排序`)),
        rows.length === 0 ? React.createElement('div', { className: 'to-method' }, '这个区间没有记录。') : React.createElement('div', { className: 'to-list-card' }, rows.map(row =>
          React.createElement('div', { className: 'to-row', key: row.id },
            React.createElement('div', { className: 'to-row-main' },
              React.createElement('div', { className: 'to-row-name', title: row.label }, row.label),
              React.createElement('div', { className: 'to-row-meta' }, model ? row.clientLabel : `缓存 ${percent(row.cacheRatio)}`)),
            React.createElement('div', { className: 'to-row-stats' },
              [['处理量', compact(row.processedTokens)], ['非缓存', compact(row.nonCacheTokens)], ['调用', compact(row.calls)], ['成本', money(row.cost)]].map(([label, value]) =>
                React.createElement('div', { className: 'to-row-stat', key: label },
                  React.createElement('span', null, label), React.createElement('strong', null, value))))))))
    }

    function Coverage({ overview }) {
      const history = overview.history
      const pricing = overview.pricing
      const items = [['客户端', overview.clients.length + ' 个'], ['模型', pricing.detectedModels + ' 个'], ['DSH 会话', compact(overview.dsh.scannedSessions)], ['历史保护', history.protectedDates + ' 天']]
      return React.createElement('section', { className: 'to-section' },
        React.createElement('h3', { className: 'to-section-title' }, '数据覆盖',
          React.createElement('small', null, `${pricing.matchedModels}/${pricing.detectedModels} 个模型已匹配价格`)),
        React.createElement('div', { className: 'to-coverage-card' },
          React.createElement('div', { className: 'to-coverage' }, items.map(([label, value]) =>
            React.createElement('div', { className: 'to-coverage-item', key: label }, React.createElement('span', null, label), React.createElement('strong', null, value)))),
          React.createElement('p', { className: 'to-method' },
            '处理量 = 输入 + 输出 + 缓存读取 + 缓存写入；推理 Token 已计入输出，只作为明细单列。成本按统一公开价估算，不是实际账单。',
            history.restoredDates > 0 ? ` 已恢复 ${history.restoredDates} 天历史。` : '',
            history.estimatedDates.length > 0 ? ` 其中 ${history.estimatedDates.length} 天为已披露估算。` : ''),
          overview.warnings.length > 0 ? React.createElement('ul', { className: 'to-warnings' }, overview.warnings.map((warning, index) => React.createElement('li', { key: index }, warning))) : null))
    }

    function TokenOverviewSection() {
      const [snapshot, setSnapshot] = React.useState(null)
      const [rangeId, setRangeId] = React.useState('today')
      const [networkError, setNetworkError] = React.useState(false)
      const load = React.useCallback(async () => {
        try {
          const response = await fetch(API_URL, { cache: 'no-store' })
          if (!response.ok) throw new Error('HTTP ' + response.status)
          setSnapshot(await response.json())
          setNetworkError(false)
        } catch { setNetworkError(true) }
      }, [])
      React.useEffect(() => {
        void load()
        const timer = window.setInterval(() => { void load() }, POLL_MS)
        return () => { window.clearInterval(timer) }
      }, [load])

      const overview = snapshot?.overview
      const range = overview?.ranges?.[rangeId]
      const metrics = range?.metrics
      return React.createElement('div', { className: 'to-root', 'aria-busy': snapshot?.refreshing || undefined },
        React.createElement(SettingsSectionHeader, {
          title: 'Token 总览',
          description: overview === undefined ? '统一查看这台电脑上的 AI 模型处理量、缓存、调用与成本。' : overview.clients.join(' · '),
        }),
        React.createElement('div', { className: 'to-freshness' }, `每 10 分钟自动更新 · 更新于 ${clock(snapshot?.updatedAt)}`, snapshot?.nextRefreshAt ? ` · 下次 ${clock(snapshot.nextRefreshAt)}` : ''),
        React.createElement('div', { className: 'to-ranges', role: 'group', 'aria-label': '统计范围' }, RANGE_OPTIONS.map(option =>
          React.createElement('button', { key: option.id, type: 'button', className: 'to-range', 'aria-pressed': rangeId === option.id, onClick: () => setRangeId(option.id) }, option.label))),
        networkError && overview === undefined
          ? React.createElement('div', { className: 'to-error', role: 'alert' }, '暂时无法连接用量服务；后台会继续重试。')
          : metrics === undefined ? React.createElement('div', { className: 'to-empty' }, '正在生成第一份 Token 总览，完成后会自动出现。')
            : React.createElement(React.Fragment, null,
              React.createElement('section', { className: 'to-summary', 'aria-label': '核心指标' },
                React.createElement('div', { className: 'to-summary-head' }, React.createElement('span', { className: 'to-eyebrow' }, '核心指标'), React.createElement('span', { className: 'to-period' }, `${rangeCopy(rangeId, range.range)} · 活跃 ${metrics.activeDays}/${metrics.totalDays} 天`)),
                React.createElement('div', { className: 'to-kpis' },
                  React.createElement(Kpi, { label: '处理量', value: compact(metrics.processedTokens), note: '含缓存 Token' }),
                  React.createElement(Kpi, { label: '非缓存', value: compact(metrics.nonCacheTokens), note: '输入 + 输出' }),
                  React.createElement(Kpi, { label: '模型调用', value: compact(metrics.calls), note: '真实模型请求' }),
                  React.createElement(Kpi, { label: 'API 等价成本', value: money(metrics.cost), note: '统一公开价估算' })),
                React.createElement(Breakdown, { metrics })),
              React.createElement(Trend, { range, rangeId, updatedAt: snapshot?.updatedAt }),
              React.createElement(RankedList, { title: '客户端明细', rows: range.clients, model: false }),
              React.createElement(RankedList, { title: '模型明细', rows: range.models, model: true }),
              React.createElement(Coverage, { overview })),
        snapshot?.reportUrl ? React.createElement('section', { className: 'to-detail' },
          React.createElement('div', { className: 'to-detail-main' }, React.createElement('h3', { className: 'to-detail-title' }, '详细数据'), React.createElement('p', { className: 'to-detail-copy' }, '查看逐日记录、全部客户端与模型、价格匹配、历史恢复和统计口径。')),
          React.createElement('a', { className: 'to-report-link', href: snapshot.reportUrl }, '打开详细数据', React.createElement(IconRightUpOutline14, { size: 10 }))) : null,
        overview ? React.createElement('p', { className: 'to-source' }, `数据引擎 Tokscale ${overview.runtime.version} · ${overview.runtime.source} · 后台每 10 分钟生成完整快照`, snapshot?.lastError ? ' · 本轮更新失败，已保留上次快照' : '') : null)
    }

    return {
      name: 'token-overview',
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        const style = document.createElement('style')
        style.setAttribute('data-plugin', '@deepseek-ai/dsh-token-overview')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => { style.remove() })
        slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: 'token-overview', order: 22, label: () => 'Token 总览' }, TokenOverviewSection))
        slots.inject('settings.section.icon', () => slots.register({
          name: 'settings.section.icon', id: 'token-overview',
        }, IconUsageTrendOutline16))
      },
    }
  },
})

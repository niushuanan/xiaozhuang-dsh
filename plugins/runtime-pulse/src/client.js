/** Xiaozhuang Runtime Pulse, browser half. */
window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-runtime-pulse',
  factory: (require) => {
    const React = require('react')
    const {
      IconChevronDownOutline14,
      IconChevronRightOutline14,
      IconChevronUpOutline14,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const CSS = [
      '.rp-root { box-sizing:border-box; container-type:inline-size; position:relative; z-index:3; display:flex; justify-content:center; width:100%; max-width:var(--dsh-chat-content-width); margin:0 auto; padding:3px calc(var(--dsh-composer-side-clearance) + 12px) 0; color:var(--dsw-alias-label-tertiary); }',
      '.rp-root * { box-sizing:border-box; }',
      '.rp-trigger { display:inline-flex; align-items:center; justify-content:center; gap:0; width:auto; max-width:100%; min-width:0; min-height:22px; margin:0; padding:1px 7px; border:0; border-radius:7px; background:transparent; color:inherit; font:inherit; font-size:11px; line-height:18px; white-space:nowrap; cursor:pointer; transition:background-color .14s ease,color .14s ease; }',
      '.rp-trigger:hover,.rp-trigger[aria-expanded="true"] { background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent); color:var(--dsw-alias-label-secondary); }',
      '.rp-trigger:focus-visible { outline:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent); outline-offset:0; }',
      '.rp-summary-item { display:inline-flex; align-items:center; min-width:0; flex:none; font-variant-numeric:tabular-nums; letter-spacing:.002em; }',
      '.rp-summary-item + .rp-summary-item::before { content:""; width:1px; height:9px; margin:0 9px; background:color-mix(in srgb,var(--dsw-alias-label-tertiary) 22%,transparent); }',
      '.rp-summary-tokens { color:var(--dsw-alias-label-secondary); }',
      '.rp-chevron { display:inline-grid; place-items:center; width:14px; height:14px; margin-left:7px; flex:none; color:var(--dsw-alias-label-tertiary); }',
      '.rp-chevron svg { width:12px; height:12px; }',
      '.rp-panel { position:absolute; left:50%; bottom:calc(100% + 8px); width:min(620px,calc(100% - 24px)); overflow:hidden; border:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 16%,transparent); border-radius:14px; background:var(--dsw-alias-bg-layer-1); box-shadow:0 16px 42px rgba(15,23,42,.13),0 2px 8px rgba(15,23,42,.06); color:var(--dsw-alias-label-primary); transform:translateX(-50%); }',
      '.rp-panel-head { display:flex; align-items:center; min-height:44px; gap:10px; padding:10px 14px 9px; border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 13%,transparent); }',
      '.rp-title { flex:1; min-width:0; font-size:12px; line-height:18px; font-weight:650; }',
      '.rp-state { flex:none; color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:16px; }',
      '.rp-state[data-running="true"] { color:var(--dsw-alias-brand-primary); }',
      '.rp-open-overview { display:inline-flex; align-items:center; gap:3px; flex:none; min-height:24px; padding:0 7px; border:0; border-radius:7px; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:10px; line-height:16px; cursor:pointer; }',
      '.rp-open-overview:hover { background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent); color:var(--dsw-alias-label-primary); }',
      '.rp-open-overview:focus-visible { outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 34%,transparent); outline-offset:1px; }',
      '.rp-open-overview svg { width:11px; height:11px; }',
      '.rp-close { display:grid; place-items:center; width:24px; height:24px; padding:0; border:0; border-radius:7px; background:transparent; color:var(--dsw-alias-label-tertiary); cursor:pointer; }',
      '.rp-close:hover { background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent); color:var(--dsw-alias-label-secondary); }',
      '.rp-close:focus-visible { outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 34%,transparent); outline-offset:1px; }',
      '.rp-close svg { width:12px; height:12px; }',
      '.rp-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); padding:13px 14px 14px; }',
      '.rp-group { min-width:0; padding:0 12px; }',
      '.rp-group:first-child { padding-left:0; }',
      '.rp-group:last-child { padding-right:0; }',
      '.rp-group + .rp-group { border-left:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 14%,transparent); }',
      '.rp-group-title { margin-bottom:7px; color:var(--dsw-alias-label-tertiary); font-size:9px; line-height:14px; font-weight:600; }',
      '.rp-pair { display:flex; align-items:baseline; justify-content:space-between; gap:8px; min-width:0; font-size:10px; line-height:17px; }',
      '.rp-pair + .rp-pair { margin-top:2px; }',
      '.rp-pair-label { overflow:hidden; color:var(--dsw-alias-label-tertiary); text-overflow:ellipsis; white-space:nowrap; }',
      '.rp-pair-value { flex:none; color:var(--dsw-alias-label-primary); font-weight:620; font-variant-numeric:tabular-nums; white-space:nowrap; }',
      '.rp-sr { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; border:0; }',
      '@container (max-width:520px) { .rp-panel { width:calc(100% - 12px); } .rp-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 0; } .rp-group:nth-child(3) { padding-left:0; border-left:0; } .rp-group:nth-child(2) { padding-right:0; } .rp-group:nth-child(3),.rp-group:nth-child(4) { padding-top:11px; border-top:1px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 12%,transparent); } .rp-group:nth-child(4) { padding-right:0; } }',
      '@container (max-width:360px) { .rp-root { padding-inline:8px; } .rp-trigger { font-size:10px; padding-inline:3px; } .rp-summary-item + .rp-summary-item::before { margin-inline:6px; } .rp-chevron { margin-left:4px; } }',
      '@media (prefers-reduced-motion:reduce) { .rp-trigger { transition:none; } }',
    ].join('\n')

    function compact(value) {
      const number = Math.max(0, Number(value) || 0)
      const scaled = (amount) => amount >= 100 ? String(Math.round(amount)) : String(Math.round(amount * 10) / 10)
      if (number < 1_000) return String(Math.round(number))
      if (number < 1_000_000) return scaled(number / 1_000) + 'K'
      return scaled(number / 1_000_000) + 'M'
    }

    function duration(value) {
      const milliseconds = Math.max(0, Number(value) || 0)
      const seconds = milliseconds / 1_000
      if (seconds < 60) return (Math.round(seconds * 10) / 10) + 's'
      const whole = Math.round(seconds)
      return Math.floor(whole / 60) + 'm' + String(whole % 60).padStart(2, '0') + 's'
    }

    function throughput(tokens, milliseconds) {
      if (!(tokens > 0) || !(milliseconds > 0)) return null
      const rate = tokens / (milliseconds / 1_000)
      return (rate >= 10 ? String(Math.round(rate)) : String(Math.round(rate * 10) / 10)) + ' tok/s'
    }

    function billedInput(usage) {
      return (Number(usage?.uncachedInputTokens) || 0)
        + (Number(usage?.cacheReadTokens) || 0)
        + (Number(usage?.cacheWriteTokens) || 0)
    }

    function cachePercent(usage) {
      const total = billedInput(usage)
      if (total <= 0) return null
      return Math.min(100, Math.round((Number(usage?.cacheReadTokens) || 0) / total * 100)) + '%'
    }

    function Pair({ label, value }) {
      return React.createElement('div', { className:'rp-pair' },
        React.createElement('span', { className:'rp-pair-label' }, label),
        React.createElement('strong', { className:'rp-pair-value' }, value))
    }

    function Group({ title, rows }) {
      return React.createElement('section', { className:'rp-group' },
        React.createElement('div', { className:'rp-group-title' }, title),
        rows.map(([label, value]) => React.createElement(Pair, { key:label, label, value })))
    }

    function RuntimePulse({ useSession, useProjection }) {
      const running = useSession(snapshot => snapshot.running)
      const projected = useProjection('sessionStats')
      const usage = useProjection('tokenUsage')
      const stats = projected ?? { turns:0, steps:0, llmMs:0, toolMs:0, ttftMs:0, ttftSteps:0, decodeMs:0, decodeTokens:0 }
      const [open, setOpen] = React.useState(false)
      const rootRef = React.useRef(null)
      const panelId = React.useId()

      React.useEffect(() => {
        if (!open) return undefined
        const outside = (event) => {
          if (!rootRef.current?.contains(event.target)) setOpen(false)
        }
        const keyboard = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', outside)
        document.addEventListener('keydown', keyboard)
        return () => {
          document.removeEventListener('pointerdown', outside)
          document.removeEventListener('keydown', keyboard)
        }
      }, [open])

      const input = billedInput(usage)
      const output = Number(usage?.outputTokens) || 0
      const cache = cachePercent(usage)
      const speed = throughput(stats.decodeTokens, stats.decodeMs)
      const hasActivity = stats.steps > 0 || input > 0 || output > 0
      if (!hasActivity) return null

      const summary = []
      if (stats.steps > 0) summary.push({ id:'counts', text:`${stats.turns} 轮 · ${stats.steps} 步` })
      if (speed !== null) summary.push({ id:'speed', text:speed })
      if (cache !== null) summary.push({ id:'cache', text:`缓存 ${cache}` })
      if (input > 0 || output > 0) summary.push({ id:'tokens', text:`${compact(input)} → ${compact(output)}` })

      const llmTime = stats.llmMs > 0 ? duration(stats.llmMs) : '—'
      const toolTime = stats.toolMs > 0 ? duration(stats.toolMs) : '—'
      const averageFirstToken = stats.ttftSteps > 0 ? duration(stats.ttftMs / stats.ttftSteps) : '—'
      const groups = [
        { title:'交互', rows:[['轮次', String(stats.turns)], ['步骤', String(stats.steps)]] },
        { title:'耗时', rows:[['模型', llmTime], ['工具', toolTime]] },
        { title:'生成', rows:[['首 token 平均', averageFirstToken], ['输出速度', speed ?? '—']] },
        { title:'Token', rows:[['输入', compact(input)], ['输出', compact(output)], ['缓存读取', compact(usage?.cacheReadTokens)], ['缓存写入', compact(usage?.cacheWriteTokens)]] },
      ]
      const accessible = summary.map(item => item.text).join('，')
      const openTokenOverview = () => {
        window.dispatchEvent(new CustomEvent('dsh:open-settings-section', { detail:{ id:'token-overview' } }))
        setOpen(false)
      }

      return React.createElement('div', { className:'rp-root', ref:rootRef, 'data-runtime-pulse':'' },
        open ? React.createElement('div', { className:'rp-panel', id:panelId, role:'dialog', 'aria-label':'本会话运行详情', 'data-runtime-pulse-panel':'' },
          React.createElement('header', { className:'rp-panel-head' },
            React.createElement('div', { className:'rp-title' }, '本会话运行详情'),
            React.createElement('span', { className:'rp-state', 'data-running':running || undefined }, running ? '生成中' : '已就绪'),
            React.createElement('button', { type:'button', className:'rp-open-overview', onClick:openTokenOverview },
              'Token 总览', React.createElement(IconChevronRightOutline14, { size:11 })),
            React.createElement('button', { type:'button', className:'rp-close', 'aria-label':'收起运行详情', onClick:() => setOpen(false) },
              React.createElement(IconChevronDownOutline14, null))),
          React.createElement('div', { className:'rp-grid' }, groups.map(group => React.createElement(Group, { key:group.title, ...group })))) : null,
        React.createElement('button', {
          type:'button', className:'rp-trigger', 'aria-expanded':open, 'aria-controls':panelId,
          'aria-label':`${accessible}。${open ? '收起' : '查看'}本会话运行详情`,
          onClick:() => setOpen(value => !value),
        },
          summary.map(item => React.createElement('span', { key:item.id, className:`rp-summary-item rp-summary-${item.id}` }, item.text)),
          React.createElement('span', { className:'rp-chevron', 'aria-hidden':true }, open
            ? React.createElement(IconChevronDownOutline14, null)
            : React.createElement(IconChevronUpOutline14, null)),
          React.createElement('span', { className:'rp-sr' }, open ? '详情已展开' : '点击查看详情')))
    }

    return {
      name:'runtime-pulse',
      inject:['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        const style = document.createElement('style')
        style.setAttribute('data-plugin', '@deepseek-ai/dsh-runtime-pulse')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => { style.remove() })
        slots.inject('conversation.composer.dock', () => slots.register({
          name:'conversation.composer.dock', id:'stats', order:0, priority:-10,
        }, RuntimePulse))
      },
    }
  },
})

/**
 * team-work — DeepSeek Harness Teamwork 插件（client 半边）。
 *
 * 产品职责：
 *  - 会话顶部提供低干扰的 Teamwork 团队面板入口；
 *  - 侧面板用“当前阶段 → 团队概览 → 成员分组”的层级解释团队运行；
 *  - 成员条目继续复用 sessions.openSubagent，打开真实对话与轨迹；
 *  - 目录打开时消费并刷新官方 subagent catalog，不复制第二套数据。
 */
window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-team-work',
  factory: (require) => {
    const React = require('react')
    const {
      IconCheckOutline16,
      IconChevronDownOutline14,
      IconQuestionOutline14,
      IconTeamworkOutline16,
      SettingsSectionHeader: SharedSettingsSectionHeader,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    const { PermissionSelect } = require('@deepseek-ai/dsh-client-ui-conversation')
    const SettingsSectionHeader = SharedSettingsSectionHeader ?? function SettingsSectionHeaderFallback(props) {
      return React.createElement('header', { 'data-settings-section-header': 'true', style: { display: 'grid', gap: '4px', margin: '0 0 24px' } },
        React.createElement('h2', { style: { margin: 0, fontSize: '20px', lineHeight: '28px', fontWeight: 600 } }, props.title),
        props.description ? React.createElement('p', { style: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: '20px' } }, props.description) : null)
    }
    const MAX_CONCURRENT = 5
    const AUTO_REFRESH_MS = 15000
    const COLLABORATOR_API = '/plugins/xiaozhuang-plugins/api'
    const PARALLEL_API = '/plugins/parallel-development/api/runs'
    const PARALLEL_REFRESH_MS = 3000
    const COLLABORATORS = Object.freeze([
      {
        id: 'codex',
        name: 'Codex',
        description: '用于复杂编码、架构判断、疑难调试与独立代码审查。',
        meta: '复杂任务升级 · 支持后台执行',
        logo: COLLABORATOR_API + '/assets/codex-brand-v2.png',
      },
      {
        id: 'zcode',
        name: 'Z Code',
        description: '用于第二视角实现、方案验证、产品行为检查与交叉审查。',
        meta: '复杂任务升级 · 支持后台执行',
        logo: COLLABORATOR_API + '/assets/zcode-brand-v2.png',
      },
    ])

    const TEAM_CSS = [
      '.teamwork-chip { pointer-events:auto; position:relative; display:inline-grid; place-items:center; width:28px; height:28px; padding:0; border:0; border-radius:7px; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; cursor:pointer; transition:background .16s ease,color .16s ease,transform .16s ease; }',
      '.teamwork-chip:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }',
      '.teamwork-chip:active { transform:translateY(1px); }',
      '.teamwork-chip:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }',
      '.teamwork-chip[aria-expanded="true"] { background:rgba(47,107,255,.08); color:var(--dsw-alias-label-primary); }',
      '.teamwork-chip-icon { width:16px; height:16px; }',
      '.teamwork-chip-count { position:absolute; top:-3px; right:-4px; display:inline-flex; align-items:center; justify-content:center; min-width:14px; height:14px; padding:0 3px; border:2px solid var(--dsw-alias-bg-layer-1); border-radius:999px; background:var(--dsw-alias-brand-primary); color:#fff; font-size:9px; line-height:10px; font-weight:700; }',
      '.teamwork-panel { --tw-accent:#2f6bff; pointer-events:auto; position:fixed; top:76px; right:16px; width:356px; max-width:calc(100vw - 32px); max-height:min(540px,calc(100vh - 100px)); z-index:40; display:flex; flex-direction:column; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:16px; box-shadow:0 18px 54px rgba(15,23,42,.16),0 2px 8px rgba(15,23,42,.06); overflow:hidden; }',
      '.teamwork-panel:focus { outline:none; }',
      '.teamwork-panel-header { display:flex; align-items:center; gap:10px; padding:13px 14px 11px; }',
      '.teamwork-panel-mark { width:24px; height:34px; display:grid; place-items:center; flex:none; color:var(--dsw-alias-label-secondary); }',
      '.teamwork-panel-icon { width:20px; height:20px; }',
      '.teamwork-panel-heading { flex:1; min-width:0; }',
      '.teamwork-panel-title { color:var(--dsw-alias-label-primary); font-size:14px; line-height:19px; font-weight:650; letter-spacing:-.01em; }',
      '.teamwork-panel-subtitle { margin-top:1px; color:var(--dsw-alias-label-tertiary); font-size:11px; line-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
      '.teamwork-stage { margin:0 12px; padding:12px; border-radius:12px; background:linear-gradient(135deg,rgba(47,107,255,.10),rgba(47,107,255,.035)); }',
      '.teamwork-eyebrow { color:var(--dsw-alias-brand-primary); font-size:10px; line-height:14px; font-weight:650; letter-spacing:.08em; }',
      '.teamwork-stage-title { margin-top:3px; color:var(--dsw-alias-label-primary); font-size:16px; line-height:22px; font-weight:650; letter-spacing:-.015em; }',
      '.teamwork-stage-copy { margin-top:3px; color:var(--dsw-alias-label-secondary); font-size:11px; line-height:17px; }',
      '.teamwork-stepper { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; margin-top:11px; }',
      '.teamwork-step { min-width:0; }',
      '.teamwork-step-line { height:3px; border-radius:999px; background:var(--dsw-alias-border-l1); }',
      '.teamwork-step-done .teamwork-step-line,.teamwork-step-active .teamwork-step-line { background:var(--tw-accent); }',
      '.teamwork-step-label { display:block; margin-top:5px; color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:14px; }',
      '.teamwork-step-active .teamwork-step-label { color:var(--dsw-alias-label-primary); font-weight:600; }',
      '.teamwork-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin:10px 12px 0; padding:9px 0; border:1px solid var(--dsw-alias-border-l1); border-radius:11px; }',
      '.teamwork-summary-item { min-width:0; padding:0 10px; }',
      '.teamwork-summary-item + .teamwork-summary-item { border-left:1px solid var(--dsw-alias-border-l1); }',
      '.teamwork-summary-value { color:var(--dsw-alias-label-primary); font-size:14px; line-height:18px; font-weight:650; font-variant-numeric:tabular-nums; }',
      '.teamwork-summary-label { color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:14px; }',
      '.teamwork-body { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:8px 8px 10px; }',
      '.teamwork-group + .teamwork-group { margin-top:8px; }',
      '.teamwork-group-title { display:flex; align-items:center; justify-content:space-between; min-height:24px; padding:0 6px; color:var(--dsw-alias-label-secondary); font-size:11px; line-height:16px; font-weight:600; }',
      '.teamwork-group-count { color:var(--dsw-alias-label-tertiary); font-weight:500; }',
      '.teamwork-member { width:100%; display:flex; align-items:center; gap:9px; padding:8px; border:1px solid transparent; border-radius:10px; background:transparent; color:inherit; text-align:left; font:inherit; cursor:pointer; }',
      '.teamwork-member:hover { border-color:var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); }',
      '.teamwork-member:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-1px; }',
      '.teamwork-member:disabled { cursor:default; opacity:.68; }',
      '.teamwork-member-index { width:24px; height:24px; display:grid; place-items:center; flex:none; border-radius:8px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-tertiary); font-size:10px; font-weight:650; font-variant-numeric:tabular-nums; }',
      '.teamwork-member-running .teamwork-member-index { background:rgba(47,107,255,.10); color:var(--dsw-alias-brand-primary); }',
      '.teamwork-member-main { flex:1; min-width:0; }',
      '.teamwork-member-label { display:block; color:var(--dsw-alias-label-primary); font-size:12px; line-height:17px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '.teamwork-member-meta { display:block; margin-top:1px; color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '.teamwork-member-state { flex:none; padding:2px 6px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); font-size:9px; line-height:14px; font-weight:600; }',
      '.teamwork-member-running .teamwork-member-state { background:rgba(47,107,255,.10); color:var(--dsw-alias-brand-primary); }',
      '.teamwork-member-failed .teamwork-member-index, .teamwork-member-failed .teamwork-member-state { background:rgba(220,38,38,.08); color:#b42318; }',
      '.teamwork-empty { margin:4px; padding:20px 14px; border:1px dashed var(--dsw-alias-border-l1); border-radius:11px; text-align:center; }',
      '.teamwork-empty-title { color:var(--dsw-alias-label-primary); font-size:12px; line-height:18px; font-weight:600; }',
      '.teamwork-empty-copy { max-width:250px; margin:3px auto 0; color:var(--dsw-alias-label-tertiary); font-size:11px; line-height:17px; }',
      '.teamwork-footer { display:flex; align-items:center; gap:8px; padding:9px 12px; border-top:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:15px; }',
      '.teamwork-footer-copy { flex:1; min-width:0; }',
      '.tw-settings { box-sizing:border-box; width:100%; max-width:640px; padding:0 0 28px; color:var(--dsw-alias-label-primary); }',
      '.tw-settings * { box-sizing:border-box; }',
      '.tw-settings-error { margin:12px 4px 0; color:var(--dsw-alias-red-primary,#d92d20); font-size:11px; line-height:17px; }',
      '.tw-settings-section-title { display:flex; align-items:center; gap:10px; margin:20px 14px 0; color:var(--dsw-alias-label-secondary); font-size:11px; line-height:16px; font-weight:600; }',
      '.tw-settings-section-title::after { content:""; height:1px; flex:1; background:var(--dsw-alias-border-l1); }',
      '.tw-settings-list { margin:0; padding:0 14px; list-style:none; }',
      '.tw-settings-row { position:relative; display:grid; grid-template-columns:36px minmax(0,1fr) auto; column-gap:12px; min-height:132px; padding:16px 0 14px; }',
      '.tw-settings-row + .tw-settings-row::before { content:""; position:absolute; left:48px; right:0; top:0; height:1px; background:var(--dsw-alias-border-l1); }',
      '.tw-settings-logo-slot { grid-row:1 / span 2; display:grid; place-items:center; align-self:start; width:36px; height:36px; overflow:visible; padding:0; border-radius:8px; background:transparent; box-shadow:none; }',
      '.tw-settings-logo { display:block; width:100%; height:100%; max-width:none; object-fit:contain; border-radius:8px; }',
      '.tw-settings-logo-slot[data-collaborator-id="codex"] .tw-settings-logo { width:46px; height:46px; transform:translate(-5px,-5px); }',
      '.tw-settings-copy { min-width:0; }',
      '.tw-settings-name { color:var(--dsw-alias-label-primary); font-size:13px; line-height:18px; font-weight:600; }',
      '.tw-settings-description { margin-top:1px; color:var(--dsw-alias-label-secondary); font-size:11px; line-height:17px; }',
      '.tw-settings-meta { margin-top:2px; color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:15px; }',
      '.tw-settings-controls { grid-column:2 / 4; display:flex; align-items:center; flex-wrap:wrap; gap:18px; margin-top:9px; }',
      '.tw-settings-control { display:flex; align-items:center; gap:7px; min-width:0; }',
      '.tw-settings-control-label { color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:15px; }',
      '.tw-settings-picker { position:relative; min-width:0; }',
      '.tw-settings-picker-button { display:flex; align-items:center; gap:6px; max-width:190px; min-width:98px; height:28px; padding:0 7px 0 9px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--dsw-alias-label-primary); font:inherit; cursor:pointer; }',
      '.tw-settings-picker-button:hover,.tw-settings-picker-button[aria-expanded="true"] { border-color:var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); }',
      '.tw-settings-picker-button:focus-visible { outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent); outline-offset:1px; }',
      '.tw-settings-picker-button:disabled { cursor:default; opacity:.45; }',
      '.tw-settings-picker-value { overflow:hidden; flex:1; font-size:11px; line-height:16px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }',
      '.tw-settings-picker-chevron { width:14px; height:14px; flex:none; color:var(--dsw-alias-label-tertiary); transition:transform .16s ease; }',
      '.tw-settings-picker-button[aria-expanded="true"] .tw-settings-picker-chevron { transform:rotate(180deg); }',
      '.tw-settings-menu { position:absolute; z-index:60; left:0; top:calc(100% + 5px); min-width:180px; max-width:min(260px,calc(100vw - 56px)); max-height:220px; overflow:auto; padding:5px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); box-shadow:0 12px 34px rgba(15,23,42,.14),0 2px 7px rgba(15,23,42,.06); }',
      '.tw-settings-menu-item { width:100%; display:flex; align-items:center; gap:8px; min-height:30px; padding:6px 8px; border:0; border-radius:7px; background:transparent; color:var(--dsw-alias-label-primary); font:inherit; text-align:left; cursor:pointer; }',
      '.tw-settings-menu-item:hover,.tw-settings-menu-item:focus-visible { outline:none; background:var(--dsw-alias-bg-layer-2); }',
      '.tw-settings-menu-item-label { overflow:hidden; flex:1; font-size:11px; line-height:16px; text-overflow:ellipsis; white-space:nowrap; }',
      '.tw-settings-menu-check { width:16px; height:16px; flex:none; color:var(--dsw-alias-brand-primary); }',
      '.tw-settings-toggle { position:relative; width:36px; height:20px; align-self:start; margin-top:2px; padding:0; border:0; border-radius:999px; background:color-mix(in srgb,var(--dsw-alias-label-primary) 14%,var(--dsw-alias-bg-layer-1)); box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent); cursor:pointer; transition:background-color .18s ease,box-shadow .18s ease,opacity .18s ease; }',
      '.tw-settings-toggle-knob { position:absolute; left:2px; top:2px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.24),0 1px 1px rgba(0,0,0,.10); transform:translateX(0); transition:transform .18s cubic-bezier(.2,.8,.2,1),background-color .18s ease; }',
      '.tw-settings-toggle[aria-checked="true"] { background:var(--dsw-alias-label-primary); box-shadow:none; }',
      '.tw-settings-toggle[aria-checked="true"] .tw-settings-toggle-knob { background:var(--dsw-alias-bg-layer-1); transform:translateX(16px); }',
      '.tw-settings-toggle:focus-visible { outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent); outline-offset:2px; }',
      '.tw-settings-toggle:disabled { cursor:wait; opacity:.5; }',
      '.tw-settings-note { display:flex; gap:9px; margin-top:18px; padding:0 5px; color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:16px; }',
      '.tw-settings-note-mark { width:16px; height:16px; display:grid; place-items:center; flex:none; color:var(--dsw-alias-label-secondary); }',
      '.tw-settings-note-mark svg { width:14px; height:14px; }',
      '.tw-parallel-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:5px 14px; margin:8px 14px 0; padding:14px 0 15px; }',
      '.tw-parallel-heading { color:var(--dsw-alias-label-primary); font-size:13px; line-height:18px; font-weight:600; }',
      '.tw-parallel-copy { max-width:500px; color:var(--dsw-alias-label-secondary); font-size:11px; line-height:17px; }',
      '.tw-parallel-meta { grid-column:1 / 3; display:flex; flex-wrap:wrap; gap:6px 14px; margin-top:5px; color:var(--dsw-alias-label-tertiary); font-size:10px; line-height:15px; }',
      '.tw-parallel-meta strong { color:var(--dsw-alias-label-secondary); font-weight:600; }',
      '@media (max-width:720px) { .teamwork-panel { top:auto; right:10px; bottom:82px; left:10px; width:auto; max-width:none; max-height:min(62vh,520px); border-radius:15px; } }',
      '@media (max-width:700px) { .tw-settings-controls { gap:10px; } .tw-settings-row { grid-template-columns:36px minmax(0,1fr) auto; } }',
      '@media (prefers-reduced-motion:reduce) { .teamwork-chip { transition:none; } }',
    ].join('\n')

    const store = {
      open: false,
      listeners: new Set(),
      get: () => store.open,
      set(open) {
        if (store.open === open) return
        store.open = open
        for (const listener of [...store.listeners]) listener()
      },
      subscribe(listener) {
        store.listeners.add(listener)
        return () => { store.listeners.delete(listener) }
      },
    }
    const seenRunning = new Set()
    const dismissedWhileRunning = new Set()

    function useDrawerOpen() {
      return React.useSyncExternalStore(
        (listener) => store.subscribe(listener),
        () => store.open,
      )
    }

    function mark(className) {
      return React.createElement(IconTeamworkOutline16, {
        className,
        'aria-hidden': true,
      })
    }

    function formatTokens(total) {
      if (total === undefined) return undefined
      if (total < 1000) return total + ' Token'
      if (total < 1000000) return (Math.round(total / 100) / 10) + 'K Token'
      return (Math.round(total / 100000) / 10) + 'M Token'
    }

    function tokenTotal(usage) {
      if (usage === undefined) return undefined
      return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
    }

    function formatDuration(ms) {
      const s = Math.floor(ms / 1000)
      if (s < 60) return s + '秒'
      const m = Math.floor(s / 60)
      if (m < 60) return m + '分' + String(s % 60).padStart(2, '0') + '秒'
      const h = Math.floor(m / 60)
      if (h < 24) return h + '时' + String(m % 60).padStart(2, '0') + '分'
      const d = Math.floor(h / 24)
      return d + '天' + (h % 24) + '时'
    }

    function durationMs(summary, activity, now) {
      if (summary == null) return undefined
      const timing = summary.projectionValues === undefined ? undefined : summary.projectionValues.subagentTiming
      if (timing === undefined) return undefined
      if (timing.active === undefined) return timing.settledMs
      const end = activity === 'running' ? now : timing.active.through
      return timing.settledMs + Math.max(0, end - timing.active.since)
    }

    function countRunning(summaries, sessionId) {
      if (sessionId == null) return 0
      let running = 0
      for (const summary of Object.values(summaries)) {
        if (summary.parentId === sessionId && summary.origin === 'subagent' && summary.running) running += 1
      }
      return running
    }

    const EXTERNAL_TOOLS = Object.freeze({
      subagent_codex: { id: 'codex', name: 'Codex' },
      subagent_zcode: { id: 'zcode', name: 'Z Code' },
    })

    function externalRunning(snapshot) {
      if (snapshot == null || !Array.isArray(snapshot.runningCalls)) return 0
      return snapshot.runningCalls.filter(call => EXTERNAL_TOOLS[call.name] !== undefined).length
    }

    function callDescription(argsRaw, fallback) {
      try {
        const args = JSON.parse(argsRaw)
        return typeof args.description === 'string' && args.description.trim().length > 0
          ? args.description.trim()
          : fallback
      } catch { return fallback }
    }

    function externalRows(snapshot, settings, now) {
      if (snapshot == null) return []
      const rows = new Map()
      for (const node of snapshot.nodes ?? []) {
        if (node.kind !== 'tool-result' || node.call == null) continue
        const product = EXTERNAL_TOOLS[node.call.name]
        if (product === undefined) continue
        const agent = settings?.[product.id]
        const model = product.id === 'codex' ? agent?.model : agent?.modelId
        const meta = [product.name, model, agent?.reasoningEffort?.toUpperCase(), node.callTime == null ? undefined : formatDuration(node.time - node.callTime)]
          .filter(Boolean).join(' · ')
        rows.set(node.callId, {
          id: 'external-' + node.callId,
          label: callDescription(node.call.argsRaw, product.name + ' 协作任务'),
          activity: node.isError === true ? 'failed' : 'inactive',
          external: true,
          meta,
        })
      }
      for (const call of snapshot.runningCalls ?? []) {
        const product = EXTERNAL_TOOLS[call.name]
        if (product === undefined) continue
        const agent = settings?.[product.id]
        const model = product.id === 'codex' ? agent?.model : agent?.modelId
        const meta = [product.name, model, agent?.reasoningEffort?.toUpperCase(), formatDuration(Math.max(0, now - call.time))]
          .filter(Boolean).join(' · ')
        rows.set(call.callId, {
          id: 'external-' + call.callId,
          label: callDescription(call.argsRaw, product.name + ' 协作任务'),
          activity: 'running',
          external: true,
          meta,
        })
      }
      return [...rows.values()]
    }

    function phaseOf(planActive, rows, running, parallelRun) {
      if (parallelRun != null) {
        if (parallelRun.status === 'preparing') return 'parallel-preparing'
        if (['executing', 'reviewing'].includes(parallelRun.status)) return 'parallel-executing'
        if (['integrating', 'validating'].includes(parallelRun.status)) return 'parallel-integrating'
        if (parallelRun.status === 'ready') return 'parallel-ready'
        if (parallelRun.status === 'completed') return 'complete'
        if (['needs-attention', 'interrupted'].includes(parallelRun.status)) return 'failed'
      }
      if (rows.length === 0) return planActive ? 'planning' : 'ready'
      if (running > 0) return 'executing'
      if (rows.some((row) => row.activity === 'failed')) return 'failed'
      return 'complete'
    }

    function phaseCopy(phase, running, total, failed, parallelRun) {
      if (phase === 'parallel-preparing') return {
        title: '正在拆分工作区',
        copy: '宿主正在冻结基线，并为每个任务准备独立 worktree。',
        subtitle: '准备并发 worktree 协作',
        step: 0,
      }
      if (phase === 'parallel-executing') return {
        title: parallelRun?.status === 'reviewing' ? '正在独立审查' : '多工作区并行执行中',
        copy: running + ' 个任务正在实现或审查；各工作区彼此隔离，不会互相覆盖文件。',
        subtitle: running + '/' + total + ' 个任务进行中',
        step: 1,
      }
      if (phase === 'parallel-integrating') return {
        title: parallelRun?.status === 'validating' ? '正在验证集成结果' : '正在集成结果',
        copy: '已完成的任务正在进入专用集成分支；冲突与回归会先在这里处理。',
        subtitle: '目标分支尚未改动',
        step: 2,
      }
      if (phase === 'parallel-ready') return {
        title: '集成结果已就绪',
        copy: parallelRun?.message ?? '目标工作区发生变化，已保留集成分支供检查。',
        subtitle: '等待检查后合入',
        step: 2,
      }
      if (phase === 'planning') return {
        title: '正在规划',
        copy: '主智能体先拆解任务；计划确认后再派发成员并行执行。',
        subtitle: '等待计划确认',
        step: 0,
      }
      if (phase === 'executing') return {
        title: '并行执行中',
        copy: running + ' 个成员正在工作，主智能体负责协调、复核与合并结果。',
        subtitle: running + '/' + total + ' 个成员运行中',
        step: 1,
      }
      if (phase === 'complete') return {
        title: '团队执行完成',
        copy: '成员任务均已结束，结果与过程仍可从下方逐项打开复查。',
        subtitle: total + ' 个成员已完成',
        step: 2,
      }
      if (phase === 'failed') return {
        title: parallelRun != null ? '并发 worktree 协作需要处理' : '团队执行结束',
        copy: parallelRun?.message ?? failed + ' 个成员未成功，其余结果与过程仍可从下方逐项复查。',
        subtitle: (total - failed) + ' 个完成 · ' + failed + ' 个失败',
        step: 2,
      }
      return {
        title: '等待派发',
        copy: '确认计划后，主智能体会在这里创建并协调最多 5 个成员。',
        subtitle: '尚未创建团队成员',
        step: 0,
      }
    }

    function modeText(mode) {
      return mode === 'one-shot' ? '一次性' : '常驻'
    }

    function laneActivity(status) {
      if (['executing', 'reviewing', 'revising', 'integrating'].includes(status)) return 'running'
      if (['failed', 'blocked', 'interrupted'].includes(status)) return 'failed'
      if (status === 'pending') return 'waiting'
      return 'inactive'
    }

    function laneStatusText(status) {
      return ({
        pending: '等待中', executing: '实现中', reviewing: '审查中', revising: '修正中',
        ready: '待集成', integrating: '集成中', integrated: '已集成', blocked: '已阻塞',
        failed: '失败', interrupted: '已中断',
      })[status] ?? '已完成'
    }

    async function loadCollaboratorStatus() {
      const response = await fetch(COLLABORATOR_API + '/status', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || '无法读取 Teamwork 设置')
      return body
    }

    async function toggleCollaborator(id, enabled) {
      const response = await fetch(COLLABORATOR_API + '/toggle', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || '协作者切换失败')
      return body
    }

    async function configureCollaborator(id, config) {
      const response = await fetch(COLLABORATOR_API + '/configure', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...config }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || '协作者设置保存失败')
      return body
    }

    function SettingsPicker({ label, value, options, disabled, onChange }) {
      const [open, setOpen] = React.useState(false)
      const rootRef = React.useRef(null)
      const current = options.find(option => option.id === value)

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      return React.createElement('div', { className: 'tw-settings-control' },
        React.createElement('span', { className: 'tw-settings-control-label' }, label),
        React.createElement('div', { className: 'tw-settings-picker', ref: rootRef },
          React.createElement('button', {
            type: 'button', className: 'tw-settings-picker-button',
            'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': open,
            disabled: disabled || options.length === 0,
            onClick: () => setOpen(currentOpen => !currentOpen),
          },
            React.createElement('span', { className: 'tw-settings-picker-value' }, current?.label ?? '暂无可选项'),
            React.createElement(IconChevronDownOutline14, { className: 'tw-settings-picker-chevron', 'aria-hidden': true }),
          ),
          open ? React.createElement('div', { className: 'tw-settings-menu', role: 'menu', 'aria-label': label },
            options.map(option => React.createElement('button', {
              key: option.id,
              type: 'button',
              className: 'tw-settings-menu-item',
              role: 'menuitemradio',
              'aria-checked': option.id === value,
              onClick: () => {
                setOpen(false)
                if (option.id !== value) onChange(option.id)
              },
            },
              React.createElement('span', { className: 'tw-settings-menu-item-label' }, option.label),
              option.id === value
                ? React.createElement(IconCheckOutline16, { className: 'tw-settings-menu-check', 'aria-hidden': true })
                : null,
            )),
          ) : null,
        ),
      )
    }

    function CollaboratorRow({ collaborator, state, settings, busy, onToggle, onConfigure }) {
      const enabled = state?.enabled === true
      const models = Array.isArray(settings?.models) ? settings.models : []
      const modelValue = collaborator.id === 'codex'
        ? settings?.model
        : settings?.providerId != null && settings?.modelId != null
          ? settings.providerId + '/' + settings.modelId
          : undefined
      const currentModel = models.find(model => model.id === modelValue)
      const efforts = Array.isArray(currentModel?.efforts) ? currentModel.efforts : []
      const modelOptions = models.map(model => ({ id: model.id, label: model.label ?? model.id }))
      const effortOptions = efforts.map(effort => ({ id: effort, label: effort.toUpperCase() }))
      const actionLabel = busy
        ? enabled ? '正在关闭' : '正在开启'
        : enabled ? '已开启，点击关闭' : '已关闭，点击开启'

      return React.createElement('li', { className: 'tw-settings-row' },
        React.createElement('span', {
          className: 'tw-settings-logo-slot', 'data-collaborator-id': collaborator.id, 'aria-hidden': true,
        }, React.createElement('img', { className: 'tw-settings-logo', src: collaborator.logo, alt: '' })),
        React.createElement('div', { className: 'tw-settings-copy' },
          React.createElement('div', { className: 'tw-settings-name' }, collaborator.name),
          React.createElement('div', { className: 'tw-settings-description' }, collaborator.description),
          React.createElement('div', { className: 'tw-settings-meta' }, collaborator.meta),
        ),
        React.createElement('button', {
          type: 'button', className: 'tw-settings-toggle', role: 'switch',
          'aria-checked': enabled,
          'aria-label': collaborator.name + '：' + actionLabel,
          title: actionLabel,
          'aria-busy': busy,
          disabled: busy || state === undefined,
          onClick: () => onToggle(collaborator.id, !enabled),
        }, React.createElement('span', { className: 'tw-settings-toggle-knob', 'aria-hidden': true })),
        React.createElement('div', { className: 'tw-settings-controls' },
          React.createElement(SettingsPicker, {
            label: '模型', value: modelValue, options: modelOptions,
            disabled: busy || !enabled,
            onChange: (nextModelId) => {
              const nextModel = models.find(model => model.id === nextModelId)
              const nextEfforts = Array.isArray(nextModel?.efforts) ? nextModel.efforts : []
              const nextEffort = nextEfforts.includes(settings?.reasoningEffort)
                ? settings.reasoningEffort
                : nextModel?.defaultEffort ?? nextEfforts[0]
              if (nextModel == null || nextEffort == null) return
              onConfigure(collaborator.id, nextModel, nextEffort)
            },
          }),
          React.createElement(SettingsPicker, {
            label: '思考', value: settings?.reasoningEffort, options: effortOptions,
            disabled: busy || !enabled,
            onChange: (nextEffort) => {
              if (currentModel != null) onConfigure(collaborator.id, currentModel, nextEffort)
            },
          }),
        ),
      )
    }

    function ParallelDevelopmentRow({ state, busy, onToggle }) {
      const enabled = state?.enabled === true
      return React.createElement('div', { className: 'tw-parallel-card' },
        React.createElement('div', { className: 'tw-parallel-heading' }, '并发 worktree 协作'),
        React.createElement('button', {
          type: 'button', className: 'tw-settings-toggle', role: 'switch',
          'aria-checked': enabled,
          'aria-label': enabled ? '并发 worktree 协作已开启，点击关闭' : '并发 worktree 协作已关闭，点击开启',
          title: enabled ? '已开启，点击关闭' : '已关闭，点击开启',
          'aria-busy': busy,
          disabled: busy || state === undefined,
          onClick: () => onToggle('parallel-development', !enabled),
        }, React.createElement('span', { className: 'tw-settings-toggle-knob', 'aria-hidden': true })),
        React.createElement('div', { className: 'tw-parallel-copy' }, '任务适合并行时，Teamwork 会自动拆成几个独立工作区同时推进，完成后统一检查、处理冲突并合回当前分支。'),
        React.createElement('div', { className: 'tw-parallel-meta' },
          React.createElement('span', null, React.createElement('strong', null, '3'), ' 路默认并发'),
          React.createElement('span', null, React.createElement('strong', null, '5'), ' 路最高并发'),
          React.createElement('span', null, '目标分支变化时不会自动写入'),
        ),
      )
    }

    function TeamworkSettingsSection() {
      const [states, setStates] = React.useState({})
      const [settings, setSettings] = React.useState({})
      const [busyId, setBusyId] = React.useState(null)
      const [error, setError] = React.useState('')

      const applySnapshot = (snapshot) => {
        if (Array.isArray(snapshot?.plugins)) {
          setStates(Object.fromEntries(snapshot.plugins.map(plugin => [plugin.id, plugin])))
        }
        if (snapshot?.externalAgents != null) setSettings(snapshot.externalAgents)
      }

      const reload = React.useCallback(async () => {
        const snapshot = await loadCollaboratorStatus()
        applySnapshot(snapshot)
      }, [])

      React.useEffect(() => {
        let live = true
        loadCollaboratorStatus().then((snapshot) => {
          if (live) applySnapshot(snapshot)
        }).catch((reason) => { if (live) setError(reason.message) })
        return () => { live = false }
      }, [])

      const onToggle = async (id, enabled) => {
        setBusyId(id)
        setError('')
        try {
          applySnapshot(await toggleCollaborator(id, enabled))
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          try { await reload() } catch {}
        } finally {
          setBusyId(null)
        }
      }

      const onConfigure = async (id, model, reasoningEffort) => {
        setBusyId(id)
        setError('')
        try {
          const config = id === 'codex'
            ? { model: model.id, reasoningEffort }
            : { providerId: model.providerId, modelId: model.modelId, reasoningEffort }
          applySnapshot(await configureCollaborator(id, config))
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          try { await reload() } catch {}
        } finally {
          setBusyId(null)
        }
      }

      return React.createElement('div', { className: 'tw-settings' },
        React.createElement(SettingsSectionHeader, {
          title: 'Teamwork',
          description: '日常任务由产品原生子代理执行；复杂任务或独立复核时，再调用外部专家。',
        }),
        error ? React.createElement('div', { className: 'tw-settings-error', role: 'alert' }, error) : null,
        React.createElement('div', { className: 'tw-settings-section-title' }, '协作方式'),
        React.createElement(ParallelDevelopmentRow, {
          state: states['parallel-development'],
          busy: busyId === 'parallel-development',
          onToggle,
        }),
        React.createElement('div', { className: 'tw-settings-section-title' }, '外部专家'),
        React.createElement('ul', { className: 'tw-settings-list', 'aria-label': 'Teamwork 外部专家' },
          COLLABORATORS.map(collaborator => React.createElement(CollaboratorRow, {
            key: collaborator.id,
            collaborator,
            state: states[collaborator.id],
            settings: settings[collaborator.id],
            busy: busyId === collaborator.id,
            onToggle,
            onConfigure,
          })),
        ),
        React.createElement('div', { className: 'tw-settings-note' },
          React.createElement('span', { className: 'tw-settings-note-mark', 'aria-hidden': true }, React.createElement(IconQuestionOutline14, null)),
          React.createElement('span', null, '原生子代理无需配置。并发 worktree 协作只在仓库干净且任务适合隔离时启用；普通任务仍走单一工作区。外部专家只在复杂任务、独立复核或你明确点名时调用。'),
        ),
      )
    }

    return {
      name: 'team-work',
      inject: ['sessions', 'slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return

        // Projection stores intentionally retain their last value. A separate
        // lifecycle marker makes hot-plug presence exact: the shipped composer
        // shows the additive Teamwork row only while this client package is
        // really mounted.
        const capabilityAttribute = 'data-dsh-teamwork-capability'
        const capabilityEvent = 'dsh:teamwork-capability-change'
        const capabilityToken = 'teamwork-' + Math.random().toString(36).slice(2)
        document.documentElement.setAttribute(capabilityAttribute, capabilityToken)
        document.dispatchEvent(new Event(capabilityEvent))
        ctx.effect(() => () => {
          if (document.documentElement.getAttribute(capabilityAttribute) === capabilityToken) {
            document.documentElement.removeAttribute(capabilityAttribute)
            document.dispatchEvent(new Event(capabilityEvent))
          }
        })

        const style = document.createElement('style')
        style.setAttribute('data-plugin', '@deepseek-ai/dsh-team-work')
        style.setAttribute('data-plugin-css', 'team-work')
        style.textContent = TEAM_CSS
        document.head.appendChild(style)
        ctx.effect(() => () => {
          if (style.parentNode != null) style.parentNode.removeChild(style)
        })

        function useSessionProjection(sessionId, key, selector) {
          const [value, setValue] = React.useState(selector(undefined))
          React.useEffect(() => {
            if (sessionId == null) {
              setValue(selector(undefined))
              return undefined
            }
            const binding = ctx.sessions.binding(sessionId)
            if (binding === undefined) {
              setValue(selector(undefined))
              return undefined
            }
            const face = binding.session.projections.faceOf(key)
            const read = () => { setValue(selector(face.getSnapshot())) }
            read()
            return face.subscribe(read)
          }, [sessionId, key])
          return value
        }

        function useSessionSnapshot(sessionId) {
          const [value, setValue] = React.useState(undefined)
          React.useEffect(() => {
            const binding = sessionId == null ? undefined : ctx.sessions.binding(sessionId)
            if (binding === undefined) {
              setValue(undefined)
              return undefined
            }
            const read = () => { setValue(binding.session.getSnapshot()) }
            read()
            return binding.session.subscribe(read)
          }, [sessionId])
          return value
        }

        function useExternalAgentSettings(open) {
          const [value, setValue] = React.useState({})
          React.useEffect(() => {
            if (!open) return undefined
            let live = true
            fetch('/plugins/xiaozhuang-plugins/api/status', { cache: 'no-store' })
              .then(response => response.ok ? response.json() : undefined)
              .then(body => { if (live && body?.externalAgents != null) setValue(body.externalAgents) })
              .catch(() => {})
            return () => { live = false }
          }, [open])
          return value
        }

        function useParallelRuns(sessionId, open) {
          const [value, setValue] = React.useState([])
          React.useEffect(() => {
            if (!open || sessionId == null) {
              setValue([])
              return undefined
            }
            let live = true
            let syncing = false
            const sync = () => {
              if (syncing) return
              syncing = true
              fetch(PARALLEL_API + '?sessionId=' + encodeURIComponent(sessionId), { cache: 'no-store' })
                .then(response => response.ok ? response.json() : { runs: [] })
                .then(body => { if (live && Array.isArray(body?.runs)) setValue(body.runs) })
                .catch(() => {})
                .finally(() => { syncing = false })
            }
            sync()
            const id = window.setInterval(sync, PARALLEL_REFRESH_MS)
            return () => { live = false; window.clearInterval(id) }
          }, [sessionId, open])
          return value
        }

        function TeamworkChip(props) {
          const { useSessions, sessionId } = props
          const teamWork = useSessionProjection(sessionId, 'teamwork', (value) => value?.active === true) === true
          const session = useSessionSnapshot(sessionId)
          const summaries = useSessions((state) => state.byId)
          const open = useDrawerOpen()
          if (!teamWork) return null

          const running = countRunning(summaries, sessionId) + externalRunning(session)

          return React.createElement('button', {
            type: 'button',
            className: 'teamwork-chip',
            title: 'Teamwork 团队面板',
            'aria-label': 'Teamwork 团队面板',
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'data-teamwork-trigger': 'true',
            onClick: () => {
              if (!open && sessionId != null) dismissedWhileRunning.delete(sessionId)
              store.set(!open)
            },
          },
            mark('teamwork-chip-icon'),
            running > 0 && React.createElement('span', {
              className: 'teamwork-chip-count',
              'aria-label': running + ' 个成员运行中',
            }, String(running)),
          )
        }

        function TeamworkAccess(props) {
          const teamwork = props.useProjection('teamwork')
          return React.createElement(PermissionSelect, {
            value: props.value,
            locked: props.locked,
            command: props.command,
            t: props.t,
            additiveOptions: teamwork === undefined ? [] : [{
              id: 'teamwork-toggle',
              label: 'Teamwork',
              active: teamwork.active === true,
              toggleCommand: active => '/teamwork ' + (active ? 'on' : 'off'),
            }],
          })
        }

        function TeamworkPanel(props) {
          const { useSessions } = props
          const open = useDrawerOpen()
          const sessionId = useSessions((state) => state.current)
          const summaries = useSessions((state) => state.byId)
          const catalogs = useSessions((state) => state.subagentsByParent)
          const teamWork = useSessionProjection(
            sessionId,
            'teamwork',
            (value) => value?.active === true,
          ) === true
          const planActive = useSessionProjection(
            sessionId,
            'plan',
            (value) => value !== undefined && (value.pending ? !value.active : value.active),
          ) === true
          const [now, setNow] = React.useState(Date.now())
          const panelRef = React.useRef(null)
          const session = useSessionSnapshot(sessionId)
          const externalSettings = useExternalAgentSettings(open)
          const parallelRuns = useParallelRuns(sessionId, open)
          const running = countRunning(summaries, sessionId) + externalRunning(session)

          React.useEffect(() => {
            if (!teamWork) store.set(false)
          }, [teamWork])

          React.useEffect(() => {
            if (sessionId == null) return
            if (running > 0) {
              if (!seenRunning.has(sessionId)) {
                seenRunning.add(sessionId)
                if (!dismissedWhileRunning.has(sessionId)) store.set(true)
              }
            } else {
              seenRunning.delete(sessionId)
              dismissedWhileRunning.delete(sessionId)
            }
          }, [running, sessionId])

          React.useEffect(() => {
            if (!open || sessionId == null) return
            let syncing = false
            const syncCatalog = () => {
              if (syncing) return
              syncing = true
              void ctx.sessions.refreshSubagents(sessionId)
                .catch(() => {})
                .finally(() => { syncing = false })
            }
            ctx.sessions.setSubagentCatalogOpen(sessionId, true)
            syncCatalog()
            const id = window.setInterval(syncCatalog, AUTO_REFRESH_MS)
            return () => {
              window.clearInterval(id)
              ctx.sessions.setSubagentCatalogOpen(sessionId, false)
            }
          }, [open, sessionId])

          React.useEffect(() => {
            if (!open) return
            const panel = panelRef.current
            if (panel != null) panel.focus()
            const onKeyDown = (event) => {
              if (event.key !== 'Escape') return
              if (sessionId != null && running > 0) dismissedWhileRunning.add(sessionId)
              store.set(false)
            }
            const onPointerDown = (event) => {
              const target = event.target
              if (!(target instanceof Node)) return
              if (panelRef.current?.contains(target)) return
              if (target instanceof Element && target.closest('[data-teamwork-trigger="true"]') != null) return
              if (sessionId != null && running > 0) dismissedWhileRunning.add(sessionId)
              store.set(false)
            }
            document.addEventListener('keydown', onKeyDown)
            document.addEventListener('pointerdown', onPointerDown)
            return () => {
              document.removeEventListener('keydown', onKeyDown)
              document.removeEventListener('pointerdown', onPointerDown)
            }
          }, [open, sessionId, running])

          React.useEffect(() => {
            if (running === 0) return
            const id = window.setInterval(() => { setNow(Date.now()) }, 1000)
            return () => { window.clearInterval(id) }
          }, [running])

          if (!open || sessionId == null || !teamWork) return null

          const catalog = catalogs[sessionId]
          const parallelRun = parallelRuns[0]
          const parallelChildIds = new Set((parallelRun?.lanes ?? []).flatMap(lane => [lane.childSessionId, lane.reviewSessionId]).filter(Boolean))
          const readyEntries = catalog !== undefined && catalog.state === 'ready'
            ? catalog.entries.filter((entry) => entry.kind === 'child')
            : []
          const harnessRows = readyEntries.length > 0
            ? readyEntries.filter(entry => !parallelChildIds.has(entry.id)).map((entry) => ({
              id: entry.id,
              label: entry.label ?? entry.id,
              mode: entry.mode,
              activity: entry.activity,
              summary: summaries[entry.id],
            }))
            : Object.values(summaries)
              .filter((summary) => summary.parentId === sessionId && summary.origin === 'subagent' && !parallelChildIds.has(summary.id))
              .map((summary) => ({
                id: summary.id,
                label: summary.displayTitle ?? summary.title ?? summary.id,
                mode: undefined,
                activity: summary.running ? 'running' : 'inactive',
                summary,
              }))
          const parallelRows = (parallelRun?.lanes ?? []).map((lane) => ({
            id: 'parallel-' + parallelRun.id + '-' + lane.id,
            label: lane.title,
            mode: lane.childSessionId == null ? undefined : 'one-shot',
            childSessionId: lane.childSessionId,
            activity: laneActivity(lane.status),
            parallel: true,
            meta: '独立 worktree · ' + laneStatusText(lane.status),
            summary: lane.childSessionId == null ? undefined : summaries[lane.childSessionId],
          }))
          const rows = [...parallelRows, ...harnessRows, ...externalRows(session, externalSettings, now)]

          const runningRows = rows.filter((row) => row.activity === 'running')
          const failedRows = rows.filter((row) => row.activity === 'failed')
          const waitingRows = rows.filter((row) => row.activity === 'waiting')
          const settledRows = rows.filter((row) => !['running', 'failed', 'waiting'].includes(row.activity))
          const phase = phaseOf(planActive, rows, runningRows.length, parallelRun)
          const copy = phaseCopy(phase, runningRows.length, rows.length, failedRows.length, parallelRun)

          let rowIndex = 0
          const renderRow = (row) => {
            rowIndex += 1
            const meta = []
            if (row.meta !== undefined) meta.push(row.meta)
            if (row.mode !== undefined) meta.push(modeText(row.mode))
            const ms = durationMs(row.summary, row.activity, now)
            if (ms !== undefined) meta.push(formatDuration(ms))
            const usage = row.summary === undefined || row.summary.projectionValues === undefined
              ? undefined
              : row.summary.projectionValues.tokenUsage
            const tokens = formatTokens(tokenTotal(usage))
            if (tokens !== undefined) meta.push(tokens)
            const disabled = row.mode === undefined
            const childSessionId = row.childSessionId ?? row.id
            return React.createElement('button', {
              key: row.id,
              type: 'button',
              className: 'teamwork-member'
                + (row.activity === 'running' ? ' teamwork-member-running' : '')
                + (row.activity === 'failed' ? ' teamwork-member-failed' : ''),
              disabled,
              title: row.external
                ? '外部协作者的完整结果保留在当前对话工具行中'
                : disabled ? '成员目录正在同步' : '打开“' + row.label + '”的对话与轨迹',
              onClick: () => {
                if (row.mode === undefined) return
                ctx.sessions.openSubagent({
                  parentSessionId: sessionId,
                  childSessionId,
                  mode: row.mode,
                })
              },
            },
              React.createElement('span', { className: 'teamwork-member-index' }, String(rowIndex).padStart(2, '0')),
              React.createElement('span', { className: 'teamwork-member-main' },
                React.createElement('span', { className: 'teamwork-member-label' }, row.label),
                React.createElement('span', { className: 'teamwork-member-meta' }, meta.join(' · ') || '成员信息同步中'),
              ),
              React.createElement('span', { className: 'teamwork-member-state' }, row.activity === 'running' ? '进行中' : row.activity === 'waiting' ? '等待中' : row.activity === 'failed' ? '失败' : row.parallel ? '已集成' : '已完成'),
            )
          }

          const groups = []
          if (runningRows.length > 0) {
            groups.push(React.createElement('section', { className: 'teamwork-group', key: 'running' },
              React.createElement('div', { className: 'teamwork-group-title' },
                React.createElement('span', null, '进行中'),
                React.createElement('span', { className: 'teamwork-group-count' }, runningRows.length + ' 个'),
              ),
              runningRows.map(renderRow),
            ))
          }
          if (settledRows.length > 0) {
            groups.push(React.createElement('section', { className: 'teamwork-group', key: 'settled' },
              React.createElement('div', { className: 'teamwork-group-title' },
                React.createElement('span', null, '已完成'),
                React.createElement('span', { className: 'teamwork-group-count' }, settledRows.length + ' 个'),
              ),
              settledRows.map(renderRow),
            ))
          }
          if (waitingRows.length > 0) {
            groups.push(React.createElement('section', { className: 'teamwork-group', key: 'waiting' },
              React.createElement('div', { className: 'teamwork-group-title' },
                React.createElement('span', null, '等待中'),
                React.createElement('span', { className: 'teamwork-group-count' }, waitingRows.length + ' 个'),
              ),
              waitingRows.map(renderRow),
            ))
          }
          if (failedRows.length > 0) {
            groups.push(React.createElement('section', { className: 'teamwork-group', key: 'failed' },
              React.createElement('div', { className: 'teamwork-group-title' },
                React.createElement('span', null, '失败'),
                React.createElement('span', { className: 'teamwork-group-count' }, failedRows.length + ' 个'),
              ),
              failedRows.map(renderRow),
            ))
          }

          const catalogFailed = catalog !== undefined && catalog.state === 'failed'
          const catalogLoading = catalog !== undefined && catalog.state === 'loading'

          return React.createElement('aside', {
            ref: panelRef,
            className: 'teamwork-panel',
            role: 'dialog',
            'aria-modal': 'false',
            'aria-label': 'Teamwork 团队面板',
            tabIndex: -1,
          },
            React.createElement('header', { className: 'teamwork-panel-header' },
              React.createElement('div', { className: 'teamwork-panel-mark' }, mark('teamwork-panel-icon')),
              React.createElement('div', { className: 'teamwork-panel-heading' },
                React.createElement('div', { className: 'teamwork-panel-title' }, 'Teamwork'),
                React.createElement('div', { className: 'teamwork-panel-subtitle' }, copy.subtitle),
              ),
            ),
            React.createElement('section', { className: 'teamwork-stage', 'aria-label': '当前阶段' },
              React.createElement('div', { className: 'teamwork-eyebrow' }, '当前阶段'),
              React.createElement('div', { className: 'teamwork-stage-title' }, copy.title),
              React.createElement('div', { className: 'teamwork-stage-copy' }, copy.copy),
              React.createElement('div', { className: 'teamwork-stepper', 'aria-label': '拆分、并行、集成' },
                ['拆分', '并行', '集成'].map((label, index) => React.createElement('div', {
                  key: label,
                  className: 'teamwork-step' + (index < copy.step ? ' teamwork-step-done' : index === copy.step ? ' teamwork-step-active' : ''),
                },
                  React.createElement('div', { className: 'teamwork-step-line' }),
                  React.createElement('span', { className: 'teamwork-step-label' }, label),
                )),
              ),
            ),
            React.createElement('section', { className: 'teamwork-summary', 'aria-label': '团队概览' },
              React.createElement('div', { className: 'teamwork-summary-item' },
                React.createElement('div', { className: 'teamwork-summary-value' }, String(rows.length)),
                React.createElement('div', { className: 'teamwork-summary-label' }, '成员'),
              ),
              React.createElement('div', { className: 'teamwork-summary-item' },
                React.createElement('div', { className: 'teamwork-summary-value' }, String(runningRows.length)),
                React.createElement('div', { className: 'teamwork-summary-label' }, '进行中'),
              ),
              React.createElement('div', { className: 'teamwork-summary-item' },
                React.createElement('div', { className: 'teamwork-summary-value' }, parallelRun == null
                  ? runningRows.length + '/' + MAX_CONCURRENT
                  : parallelRun.lanes.filter(lane => lane.status === 'integrated').length + '/' + parallelRun.lanes.length),
                React.createElement('div', { className: 'teamwork-summary-label' }, parallelRun == null ? '并发占用' : '已集成'),
              ),
            ),
            React.createElement('div', { className: 'teamwork-body' },
              groups.length > 0
                ? groups
                : React.createElement('div', { className: 'teamwork-empty' },
                  React.createElement('div', { className: 'teamwork-empty-title' },
                    catalogFailed ? '成员列表暂时不可用' : catalogLoading ? '正在同步团队成员' : '还没有团队成员',
                  ),
                  React.createElement('div', { className: 'teamwork-empty-copy' },
                    catalogFailed
                      ? '系统会自动重试；当前会话与已完成的工作不会受影响。'
                      : phase === 'planning'
                        ? '计划确认后，主智能体会自动拆分任务并派发成员。'
                        : '团队成员出现后，会按进行中和已完成自动分组。',
                  ),
                ),
            ),
            React.createElement('footer', { className: 'teamwork-footer' },
              React.createElement('div', { className: 'teamwork-footer-copy' },
                rows.length > 0
                  ? '成员状态每 15 秒自动同步 · 点击成员可查看对话与轨迹'
                  : '成员状态每 15 秒自动同步',
              ),
            ),
          )
        }

        slots.inject('conversation.session.header.actions', () => slots.register(
          { name: 'conversation.session.header.actions', id: 'teamwork', order: 10 },
          (props) => React.createElement(TeamworkChip, {
            useSessions: props.useSessions,
            sessionId: props.sessionId,
          }),
        ))

        slots.inject('conversation.hero.actions', () => slots.register(
          { name: 'conversation.hero.actions', id: 'teamwork', order: 10 },
          (props) => React.createElement(TeamworkChip, {
            useSessions: props.useSessions,
            sessionId: props.sessionId,
          }),
        ))

        slots.inject('conversation.input.access', () => slots.register(
          { name: 'conversation.input.access', id: 'teamwork-access', order: 10 },
          TeamworkAccess,
        ))

        slots.inject('shell.overlay', () => slots.register(
          { name: 'shell.overlay', id: 'teamwork-panel', order: 40 },
          (props) => React.createElement(TeamworkPanel, { useSessions: props.useSessions }),
        ))

        slots.inject('settings.section', () => slots.register({
          name: 'settings.section', id: 'teamwork-settings', order: 21, label: () => 'Teamwork',
        }, TeamworkSettingsSection))
        slots.inject('settings.section.icon', () => slots.register({
          name: 'settings.section.icon', id: 'teamwork-settings',
        }, IconTeamworkOutline16))
      },
    }
  },
})

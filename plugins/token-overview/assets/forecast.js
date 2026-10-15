/** Live daily forecast presentation. All calculations use the cached Host snapshot. */
(() => {
  const LABELS = { all: '全部平台', codex: 'Codex', claude: 'Claude Code', dsh: 'DSH', opencode: 'OpenCode', workbuddy: 'WorkBuddy', zcode: 'Zcode' }
  const number = value => Number.isFinite(value) ? value : 0
  const compact = value => value === null || value === undefined ? '—' : Math.abs(value) >= 1e8 ? (value / 1e8).toFixed(2) + '亿' : Math.abs(value) >= 1e4 ? (value / 1e4).toFixed(1) + '万' : Math.round(value).toLocaleString('zh-CN')
  const pct = value => value === null || value === undefined ? '—' : (value * 100).toFixed(1) + '%'
  const signed = value => value === null || value === undefined ? '暂无对照' : (value >= 0 ? '+' : '') + pct(value)
  const money = value => value === null || value === undefined ? '—' : '$' + number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })
  const time = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '—'
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  let snapshot, selected = 'all', chart, timer, savedBudget = '', stopped = false, lastError
  try { savedBudget = localStorage.getItem('dsh-token-daily-budget') || '' } catch (error) { /* A disabled local store still permits an in-page budget. */ }

  function budgetRisk(row, budget) {
    if (!(budget > 0)) return null
    if (budget <= row.actual) return 1
    if (row.reliability.provisional || row.residuals.length < 8) return null
    return row.residuals.filter(error => Math.max(row.actual, row.total + error) > budget).length / row.residuals.length
  }

  function tile(id, title, value, note, extra = '') {
    return `<article class="df-tile ${extra}" data-dimension="${id}"><span class="df-label">${title}</span><strong>${value}</strong><p>${note}</p></article>`
  }

  function render(payload) {
    snapshot = payload
    const root = document.getElementById('dailyForecast')
    if (!root || !payload?.forecasts) return
    if (!payload.forecasts[selected]) selected = 'all'
    const row = payload.forecasts[selected]
    const platforms = payload.clients || []
    const reliability = row.reliability
    const risk = budgetRisk(row, Number(savedBudget))
    const budgetCopy = Number(savedBudget) > 0
      ? row.actual >= Number(savedBudget) ? '已用量已达到日预算'
        : risk === null ? '小时样本不足，暂不估计超额概率' : `预计超额概率 ${pct(risk)} · 根据历史预测误差估计`
      : '可选：填写每天希望控制的 Token 数量'
    const weekdayEffect = row.weekday.baseline > 0 ? row.weekday.expected / row.weekday.baseline - 1 : null
    const callNote = row.calls.tokensPerCall === null ? '暂无调用明细' : `当前单次平均 ${compact(row.calls.tokensPerCall)} Token`
    const revision = row.revision
    const revisionCopy = revision ? `较 ${time(revision.since)} ${revision.change >= 0 ? '上调' : '下调'} ${compact(Math.abs(revision.change))}；期间新增 ${compact(revision.observedDelta)} Token，已重新计算剩余用量。` : '这是本次首份预测；后续更新会保留变化原因。'
    const modelPlatform = row.explanationPlatform ? `（${LABELS[row.explanationPlatform] || row.explanationPlatform}）` : ''
    const existingDetails = root.querySelector('details')?.open
    root.innerHTML = `
      <div class="df-heading"><div><span class="df-kicker">TODAY · HOURLY FORECAST</span><h2>今天结束时，会用多少？</h2><p>${escape(payload.date)} · Asia/Shanghai · 每 3 分钟重新预测</p></div>
        <div class="df-stamp${payload.stale || payload.refreshError || lastError ? ' df-stale' : ''}" role="status">数据截至 ${time(payload.generatedAt)}<br>${payload.stale || payload.refreshError || lastError ? '更新暂未完成，保留上次预测' : `下次约 ${time(payload.nextRefreshAt)}`}</div></div>
      <div class="df-platforms" role="group" aria-label="今日预测平台">${['all', ...platforms].map(client => `<button type="button" data-forecast-client="${escape(client)}" aria-pressed="${client === selected}">${escape(LABELS[client] || client)}</button>`).join('')}</div>
      <div class="df-main-grid">
        ${tile(1, '全天预计', `${compact(row.total)} <small>Token</small>`, `预测范围 ${compact(row.lower)} — ${compact(row.upper)}${reliability.provisional ? ' · 暂定范围' : ' · 目标覆盖 80%'}`, 'df-primary')}
        ${tile(2, '今天还会用', compact(row.remaining), `截至现在已用 ${compact(row.actual)} Token`)}
        ${tile(4, '未来 1 / 3 / 6 小时', `<span class="df-horizons">${row.scenarios.map(item => `<span>${compact(item.tokens)}<small>${item.hours} 小时</small></span>`).join('')}</span>`, '按接下来各小时预测累计，到午夜为止')}
        ${tile(12, '全天 API 等价成本', money(row.cost.total), `当前缓存占比 ${pct(row.cost.cacheRatio)} · 公开价格估算，非账单`)}
      </div>
      <div class="df-hourly" data-dimension="3"><div class="df-subhead"><h3>今天的 24 小时</h3><span><i class="df-actual-dot"></i> 已发生 <i class="df-future-dot"></i> 待发生</span></div><div class="df-chart"><canvas id="dailyForecastChart" role="img" aria-label="今日逐小时已发生和预计 Token 使用量"></canvas></div><p>当前小时只计已发生用量；待发生部分随预测更新。历史日期筛选不影响今日预测。</p></div>
      <div class="df-insight-grid">
        ${tile(5, '同时刻进度', signed(row.sameTime.ratio === null ? null : row.sameTime.ratio - 1), `历史节律预计此时 ${compact(row.sameTime.expected)} Token`)}
        ${tile(6, '星期节律', signed(weekdayEffect), `本星期几的日基线 ${compact(row.weekday.expected)} Token`)}
        ${tile(7, '最近几小时', signed(row.activity.acceleration), `近 3 小时 ${compact(row.activity.last3)} · 前 3 小时 ${compact(row.activity.previous3)}`)}
        ${tile(8, '活跃强度', `${row.activity.activeHours} <small>/ 24 时段</small>`, `已过去 ${number(row.activity.elapsedHours).toFixed(1)} 小时 · 含当前小时`)}
        ${tile(11, '调用强度', `预计 ${compact(row.calls.total)} <small>次</small>`, callNote)}
        <article class="df-tile" data-dimension="13"><label class="df-label" for="daily-budget">每日 Token 预算</label><input id="daily-budget" type="number" inputmode="numeric" min="1" step="1000000" placeholder="例如 800000000" value="${escape(savedBudget)}"><p id="daily-budget-risk">${budgetCopy}</p></article>
      </div>
      <details class="df-details"${existingDetails ? ' open' : ''}><summary>为什么这样预测？查看平台、相似日与真实误差</summary><div class="df-detail-grid">
        <article data-dimension="10"><h3>各平台预计贡献</h3>${platforms.map(client => { const item = payload.forecasts[client]; return `<div class="df-line"><span>${escape(LABELS[client] || client)}</span><strong>${compact(item.total)}</strong><small>已用 ${compact(item.actual)}</small></div>` }).join('')}</article>
        <article data-dimension="9"><h3>今天更像哪些历史日${escape(modelPlatform)}</h3>${row.analogs.length ? row.analogs.map(item => `<div class="df-line"><span>${escape(item.date)}</span><strong>${compact(item.total)}</strong><small>当日最终用量</small></div>`).join('') : '<p>完整小时记录不足，正在积累可用的相似日。</p>'}</article>
        <article data-dimension="14"><h3>预测变化与可信度</h3><p>${revisionCopy}</p><p>${reliability.hourlyDays} 个完整小时日 · ${reliability.dailyDays} 个近期日样本 · ${reliability.excludedDays} 个小时不完整日退出日内训练。</p><p>${reliability.provisional ? '小时记录不足，当前范围为暂定估计，不能作为已验证的 80% 区间。' : '预测范围来自过去的预测残差；真实覆盖率会随使用节律变化。'}</p><table><thead><tr><th>预测时点</th><th>样本</th><th>总量误差</th><th>旧线性法</th></tr></thead><tbody>${row.backtest.byHour.map(item => `<tr><td>${String(item.hour).padStart(2, '0')}:00</td><td>${item.samples} 天</td><td>${pct(item.wape)}</td><td>${pct(item.baselineWape)}</td></tr>`).join('')}</tbody></table><p>总量误差 = 绝对误差合计 ÷ 实际用量合计；每次只用当时之前的数据回测。</p></article>
        <article><h3>本次预测依据${escape(modelPlatform)}</h3>${row.models.filter(item => item.weight > .001).map(item => `<div class="df-line"><span>${escape(item.label)}</span><strong>${pct(item.weight)}</strong></div>`).join('')}<p>模型权重随历史误差变化；样本不够的条件提升树不参与决策。预测不会预知尚未开始的新任务。</p></article>
      </div></details>`
    root.querySelectorAll('[data-forecast-client]').forEach(button => button.addEventListener('click', () => { selected = button.dataset.forecastClient; render(snapshot) }))
    root.querySelector('#daily-budget')?.addEventListener('input', event => {
      savedBudget = event.target.value
      try { localStorage.setItem('dsh-token-daily-budget', savedBudget) } catch (error) { /* Keep this budget usable for the current page. */ }
      const result = budgetRisk(row, Number(savedBudget))
      const label = root.querySelector('#daily-budget-risk')
      if (label) label.textContent = Number(savedBudget) <= 0 ? '可选：填写每天希望控制的 Token 数量' : row.actual >= Number(savedBudget) ? '已用量已达到日预算' : result === null ? '小时样本不足，暂不估计超额概率' : `预计超额概率 ${pct(result)} · 根据历史预测误差估计`
    })
    if (window.Chart) {
      chart?.destroy()
      const canvas = root.querySelector('#dailyForecastChart')
      chart = new window.Chart(canvas, { type: 'bar', data: {
        labels: row.hours.map(item => String(item.hour).padStart(2, '0') + ':00'),
        datasets: [{ label: '已发生', data: row.hours.map(item => item.actual), backgroundColor: '#369cf2', borderRadius: 3 }, { label: '待发生预测', data: row.hours.map(item => item.remaining || null), backgroundColor: '#a795e8', borderRadius: 3 }],
      }, options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${compact(item.raw)} Token` } } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 12, color: '#96979b' }, border: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: '#ececee' }, ticks: { callback: compact, color: '#96979b' }, border: { display: false } } } } })
    }
  }

  async function refresh() {
    if (stopped || document.hidden) return
    try {
      const response = await fetch('/plugins/token-overview/api/forecast', { cache: 'no-store' })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const payload = await response.json()
      lastError = undefined
      const editing = document.activeElement?.id === 'daily-budget'
      if (!editing) render(payload)
    } catch (error) {
      lastError = error.message
      if (snapshot) render(snapshot)
      else { const root = document.getElementById('dailyForecast'); if (root) root.innerHTML = '<p class="df-pending" role="status">正在准备今日预测；历史报告可继续查看。</p>' }
    }
  }
  function start() {
    void refresh()
    timer = setInterval(() => { void refresh() }, 30000)
    window.addEventListener('pagehide', () => { stopped = true; clearInterval(timer); chart?.destroy() }, { once: true })
    window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; void refresh(); timer = setInterval(() => { void refresh() }, 30000) } })
  }
  window.TokenDailyForecast = { render, start, refresh, budgetRisk }
})()

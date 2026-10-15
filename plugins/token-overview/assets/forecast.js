/** Today's forecast shares the report's platform filter and cached Host snapshot. */
(() => {
  const LABELS = { all: '全部平台', codex: 'Codex', claude: 'Claude Code', dsh: 'DSH', opencode: 'OpenCode', workbuddy: 'WorkBuddy', zcode: 'Zcode' }
  const compact = value => value === null || value === undefined ? '—' : Math.abs(value) >= 1e8 ? (value / 1e8).toFixed(2) + '亿' : Math.abs(value) >= 1e4 ? (value / 1e4).toFixed(1) + '万' : Math.round(value).toLocaleString('zh-CN')
  const pct = value => value === null || value === undefined ? '—' : (value * 100).toFixed(1) + '%'
  const time = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '—'
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  let snapshot, selected = 'all', chart, timer, stopped = false, lastError

  function render(payload) {
    snapshot = payload
    const root = document.getElementById('dailyForecast')
    if (!root || !payload?.forecasts) return
    chart?.destroy()
    chart = undefined
    const row = payload.forecasts[selected]
    const heading = `<div class="section-head"><h2>今日预测</h2><div class="section-meta">${escape(payload.date)} · ${escape(LABELS[selected] || selected)} · 每 3 分钟更新</div></div>`
    if (!row) {
      root.innerHTML = heading + '<p class="df-note">此平台暂无今日预测数据。</p>'
      return
    }
    const reliability = row.reliability
    const open = root.querySelector('details')?.open
    const stale = payload.stale || payload.refreshError || lastError
    root.innerHTML = heading + `
      <dl class="df-summary">
        <div><dt>全天预计</dt><dd>${compact(row.total)} <small>Token</small></dd></div>
        <div><dt>今日已用</dt><dd>${compact(row.actual)}</dd></div>
        <div><dt>预计剩余</dt><dd>${compact(row.remaining)}</dd></div>
      </dl>
      <div class="df-chart"><canvas id="dailyForecastChart" role="img" aria-label="今日逐小时已用和预计剩余 Token"></canvas></div>
      <div class="df-caption"><span><i class="df-actual-dot"></i>已用 <i class="df-future-dot"></i>预计剩余 · 预测范围 ${compact(row.lower)} — ${compact(row.upper)}${reliability.provisional ? '（样本不足，暂定）' : ''}</span><span role="status" class="${stale ? 'df-stale' : ''}">截至 ${time(payload.generatedAt)}${stale ? ' · 更新暂未完成，保留上次预测' : ''}</span></div>
      <details class="df-details"${open ? ' open' : ''}><summary>预测说明与历史误差</summary>
        <p class="df-note">按今天已用量和历史小时节律估计剩余用量。可用完整小时记录 ${reliability.hourlyDays} 天；${reliability.provisional ? '样本尚少，当前预测和范围仅作参考。' : '范围根据历史预测误差估计。'}尚未开始的新任务可能改变结果。日期筛选不改变今日预测。</p>
        <table><thead><tr><th>预测时点</th><th>历史样本</th><th>总量误差</th></tr></thead><tbody>${row.backtest.byHour.map(item => `<tr><td>${String(item.hour).padStart(2, '0')}:00</td><td>${item.samples} 天</td><td>${pct(item.wape)}</td></tr>`).join('')}</tbody></table>
        <p class="df-note">总量误差 = 绝对误差合计 ÷ 实际用量合计；每个历史时点只使用此前数据。</p>
      </details>`
    if (window.Chart) {
      const canvas = root.querySelector('#dailyForecastChart')
      chart = new window.Chart(canvas, { type: 'bar', data: {
        labels: row.hours.map(item => String(item.hour).padStart(2, '0') + ':00'),
        datasets: [{ label: '已用', data: row.hours.map(item => item.actual), backgroundColor: '#3498f5', borderRadius: 3 }, { label: '预计剩余', data: row.hours.map(item => item.remaining || null), backgroundColor: '#b3d6f7', borderRadius: 3 }],
      }, options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${compact(item.raw)} Token` } } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 12, color: '#96979b' }, border: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: '#ececee' }, ticks: { callback: compact, color: '#96979b' }, border: { display: false } } } } })
    }
  }

  function setClient(client) {
    if (selected === client) return
    selected = client
    if (snapshot) render(snapshot)
  }

  async function refresh() {
    if (stopped || document.hidden) return
    try {
      const response = await fetch('/plugins/token-overview/api/forecast', { cache: 'no-store' })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const payload = await response.json()
      lastError = undefined
      render(payload)
    } catch (error) {
      lastError = error.message
      if (snapshot) render(snapshot)
      else { const root = document.getElementById('dailyForecast'); if (root) root.innerHTML = '<div class="section-head"><h2>今日预测</h2></div><p class="df-note" role="status">正在准备今日预测；历史报告可继续查看。</p>' }
    }
  }
  function start() {
    void refresh()
    timer = setInterval(() => { void refresh() }, 30000)
    window.addEventListener('pagehide', () => { stopped = true; clearInterval(timer); chart?.destroy() }, { once: true })
    window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; void refresh(); timer = setInterval(() => { void refresh() }, 30000) } })
  }
  window.TokenDailyForecast = { render, start, refresh, setClient }
})()

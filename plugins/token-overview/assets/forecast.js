/** Today's forecast shares the report's platform filter and cached Host snapshot. */
(() => {
  const LABELS = { all: '全部平台', codex: 'Codex', claude: 'Claude Code', dsh: 'DSH', opencode: 'OpenCode', workbuddy: 'WorkBuddy', zcode: 'Zcode' }
  const compact = value => value === null || value === undefined ? '—' : Math.abs(value) >= 1e8 ? (value / 1e8).toFixed(2) + '亿' : Math.abs(value) >= 1e4 ? (value / 1e4).toFixed(1) + '万' : Math.round(value).toLocaleString('zh-CN')
  const pct = value => value === null || value === undefined ? '—' : (value * 100).toFixed(1) + '%'
  const time = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '—'
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  let snapshot, selected = 'all', mode = 'cumulative', chart, timer, stopped = false, lastError

  function render(payload) {
    snapshot = payload
    const root = document.getElementById('dailyForecast')
    if (!root || !payload?.forecasts) return
    chart?.destroy()
    chart = undefined
    const row = payload.forecasts[selected]
    const heading = `<div class="section-head"><h2>今日预测</h2><div class="section-meta"><div class="segment-group" aria-label="预测图表视图"><button class="segment" type="button" data-forecast-view="cumulative" aria-pressed="${mode === 'cumulative'}">累计走势</button><button class="segment" type="button" data-forecast-view="hourly" aria-pressed="${mode === 'hourly'}">每小时</button></div><span>${escape(payload.date)} · ${escape(LABELS[selected] || selected)} · 每 3 分钟更新</span></div></div>`
    if (!row) {
      root.innerHTML = heading + '<p class="df-note">此平台暂无今日预测数据。</p>'
      return
    }
    const reliability = row.reliability
    const open = root.querySelector('details')?.open
    const stale = payload.stale || payload.refreshError || lastError
    const updateCopy = stale ? (payload.refreshing ? ' · 正在更新，暂示上次预测' : ' · 更新延迟，暂示上次预测') : ''
    const comparison = row.comparisons
    const live = row.accuracy?.byHour?.find(item => item.hour === Math.floor(payload.cutoffHour))
    const accuracyCopy = live?.samples > 0
      ? `本时段已结算 ${live.samples} 天，真实预测总量误差 ${pct(live.wape)}，${live.withinTarget}/${live.samples} 天误差在 10% 内。`
      : '10% 是误差目标，尚无本时段已结算的新算法预测。'
    const coverage = comparison?.week?.days > 0 && comparison.week.days < 7 ? `近 7 天仅有 ${comparison.week.days} 天完整小时记录，均线按这些天计算。` : ''
    const available = reliability.hourlyAvailable !== false
    root.innerHTML = heading + `
      <dl class="df-summary">
        <div><dt>全天预计</dt><dd>${available ? compact(row.total) : '—'} <small>Token</small></dd></div>
        <div><dt>今日已用</dt><dd>${compact(row.actual)}</dd></div>
        <div><dt>预计剩余</dt><dd>${available ? compact(row.remaining) : '—'}</dd></div>
      </dl>
      <div class="df-chart"><canvas id="dailyForecastChart" role="img" aria-label="今日已用实线、未来预测虚线、昨日与近七天均值对比，可切换每小时"></canvas></div>
      <div class="df-caption"><span>${available ? `全天预测范围 ${compact(row.lower)} — ${compact(row.upper)}${reliability.provisional ? '（样本不足，暂定）' : ''}` : '缺少完整小时记录，暂不能估计剩余用量'}</span><span role="status" class="${stale ? 'df-stale' : ''}">截至 ${time(payload.generatedAt)}${updateCopy}</span></div>
      <details class="df-details"${open ? ' open' : ''}><summary>预测说明与历史误差</summary>
        <p class="df-note">逐小时随机森林结合历史轨迹匹配，直接估计未来各小时用量。可用完整正用量小时记录 ${reliability.hourlyDays} 天；${reliability.provisional ? '样本尚少，当前范围暂定。' : '范围根据历史预测误差估计。'}${coverage}日期筛选不改变今日预测。</p>
        <p class="df-note">${accuracyCopy}新任务和使用习惯变化会改变结果，不能保证每一天都在 10% 内。</p>
        <table><thead><tr><th>历史重放时点</th><th>样本</th><th>总量误差</th><th>10% 内</th></tr></thead><tbody>${row.backtest.byHour.map(item => `<tr><td>${String(item.hour).padStart(2, '0')}:00</td><td>${item.samples} 天</td><td>${pct(item.wape)}</td><td>${item.withinTarget ?? '—'} / ${item.samples}</td></tr>`).join('')}</tbody></table>
        <p class="df-note">历史重放只用当时之前的数据，与真正发出后结算的预测分开统计。总量误差 = 绝对误差合计 ÷ 实际用量合计；零用量日单列，不计百分比达标。</p>
      </details>`
    root.querySelectorAll('[data-forecast-view]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.forecastView; render(snapshot) }))
    if (window.Chart) drawChart(root.querySelector('#dailyForecastChart'), payload, row)
  }

  function drawChart(canvas, payload, row) {
    const cumulative = mode === 'cumulative'
    const cutoff = payload.cutoffHour ?? row.activity?.elapsedHours ?? 0
    const comparisons = row.comparisons
    const line = (label, data, color, dash = []) => ({ type: 'line', label, data, borderColor: color, backgroundColor: color,
      borderWidth: 1.7, borderDash: dash, pointRadius: 0, pointHitRadius: 8, tension: 0, spanGaps: false, stack: label })
    const accumulated = hours => {
      let total = 0
      return [{ x: 0, y: 0 }, ...hours.map((value, index) => ({ x: index + 1, y: value === null ? null : (total += value) }))]
    }
    const datasets = []
    if (cumulative) {
      let total = 0
      const actual = [{ x: 0, y: 0 }]
      for (let hour = 0; hour < Math.floor(cutoff); hour++) {
        total += row.hours[hour].actual || 0
        actual.push({ x: hour + 1, y: total })
      }
      if (cutoff % 1 > 0) actual.push({ x: cutoff, y: row.actual })
      let projected = row.actual
      const future = [{ x: cutoff, y: row.actual }]
      for (let hour = Math.floor(cutoff); hour < 24; hour++) {
        projected += row.hours[hour].remaining || 0
        future.push({ x: hour + 1, y: projected })
      }
      datasets.push(line('今日已用', actual, '#3498f5'))
      if (row.reliability.hourlyAvailable !== false) datasets.push(line('今日预计', future, '#3498f5', [6, 4]))
      if (comparisons?.yesterday.available) datasets.push(line('昨天', accumulated(comparisons.yesterday.hours), '#a1a5ad'))
      if (comparisons?.week.days > 0) datasets.push(line('近 7 天均值', accumulated(comparisons.week.hours), '#cba052'))
    } else {
      datasets.push({ type: 'bar', label: '今日已用', data: row.hours.map(hour => hour.actual), backgroundColor: '#3498f5', borderRadius: 2, stack: 'today' },
        { type: 'bar', label: '预计剩余', data: row.hours.map(hour => hour.remaining || null), backgroundColor: '#b3d6f7', borderRadius: 2, stack: 'today' })
      if (comparisons?.yesterday.available) datasets.push(line('昨天', comparisons.yesterday.hours, '#a1a5ad'))
      if (comparisons?.week.days > 0) datasets.push(line('近 7 天均值', comparisons.week.hours, '#cba052'))
    }
    const clockHour = value => { const minutes = Math.floor(value * 60 + 1e-6); return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
    chart = new window.Chart(canvas, { type: cumulative ? 'line' : 'bar', data: {
      labels: cumulative ? undefined : row.hours.map(hour => String(hour.hour).padStart(2, '0') + ':00'), datasets,
    }, options: { responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: cumulative ? 'nearest' : 'index', axis: 'x', intersect: false },
      plugins: { legend: { display: true, position: 'bottom', align: 'start', labels: { boxWidth: 16, boxHeight: 3, padding: 12, color: '#96979b', font: { size: 10 } } },
        tooltip: { callbacks: { title: items => {
          if (!items.length) return ''
          if (cumulative) return clockHour(items[0].parsed.x)
          const hour = items[0].dataIndex
          return `${clockHour(hour)}–${clockHour(hour + 1)}`
        }, label: item => `${item.dataset.label}: ${compact(item.parsed.y)} Token` } } },
      scales: { x: { type: cumulative ? 'linear' : 'category', min: cumulative ? 0 : undefined, max: cumulative ? 24 : undefined, stacked: !cumulative,
        grid: { display: false }, ticks: { stepSize: cumulative ? 4 : undefined, maxRotation: 0, maxTicksLimit: 12, color: '#96979b', callback: cumulative ? clockHour : undefined }, border: { display: false } },
        y: { stacked: !cumulative, beginAtZero: true, grid: { color: '#ececee' }, ticks: { callback: compact, color: '#96979b' }, border: { display: false } } } } })
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

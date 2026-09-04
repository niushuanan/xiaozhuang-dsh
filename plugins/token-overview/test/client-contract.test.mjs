import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

test('registers a Settings-only Token Overview section', () => {
  assert.match(client, /id: 'token-overview', order: 22, label: \(\) => 'Token 总览'/)
  assert.match(client, /name: 'settings.section'/)
  assert.doesNotMatch(client, /conversation\.session\.header|conversation\.hero|sidebar\.home/)
  assert.match(client, /SettingsSectionHeader/)
  assert.match(client, /React\.createElement\(SettingsSectionHeader/)
  assert.doesNotMatch(client, /to-title|to-head-main|to-title-row/)
})

test('shows the complete metric contract, explicit range controls and detailed data path', () => {
  for (const copy of ['今日', '近 7 天', '本月', '全部', '处理量', '非缓存', '模型调用', 'API 等价成本', '缓存读取', '缓存写入', '推理明细', '24 小时', '每 3 小时', '客户端明细', '模型明细', '数据覆盖', '打开详细数据']) {
    assert.match(client, new RegExp(copy))
  }
  assert.match(client, /to-range\[aria-pressed="true"\]/)
  assert.doesNotMatch(client, /IconListPenOutline16|to-mark/)
  assert.doesNotMatch(client, /后台更新中|数据已同步|to-live/)
  assert.match(client, /function money\(value\) \{ return '\$' \+ Math\.round\(Number\(value\) \|\| 0\)\.toLocaleString\('en-US'\) \}/)
  assert.doesNotMatch(client, /minimumFractionDigits|maximumFractionDigits/)
  assert.match(client, /container-type:inline-size/)
  assert.match(client, /@container \(max-width:520px\)/)
  assert.match(client, /to-bar-track[^\n]+label-primary\) 7%/)
  assert.match(client, /className: 'to-trend-tooltip'/)
  assert.match(client, /onPointerEnter: \(\) => setActiveIndex\(index\)/)
  assert.match(client, /onFocus: \(\) => setActiveIndex\(index\)/)
  assert.match(client, /处理量 \$\{exact\(value\)\} Token，非缓存/)
  assert.match(client, /\.to-kpi \{[^\n]*color-mix\(in srgb,var\(--dsw-alias-label-primary\) 4%/)
  assert.match(client, /\.to-list-card \{[^\n]*border-radius:14px/)
  assert.doesNotMatch(client, /linear-gradient/)
  assert.doesNotMatch(client, /title: `\$\{item\.label/)
  assert.match(client, /成本按统一公开价估算，不是实际账单/)
  assert.doesNotMatch(client, /rows\.slice\(0, 6\)/)
  assert.doesNotMatch(client, /完整报告/)
  assert.doesNotMatch(client, /target: '_blank'/)
})

test('polls the cached Host snapshot without triggering a browser-side rescan', () => {
  assert.match(client, /const POLL_MS = 30_000/)
  assert.match(client, /每 10 分钟自动更新/)
  assert.match(client, /fetch\(API_URL, \{ cache: 'no-store' \}\)/)
  assert.doesNotMatch(client, /tokscale|python3|refresh-pricing|\/api\/refresh/)
})

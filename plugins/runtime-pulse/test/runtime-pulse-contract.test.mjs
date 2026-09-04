import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const client = await readFile(new URL('lib/client.js', root), 'utf8')

test('is a client-only Xiaozhuang plugin with no duplicate collector', () => {
  assert.equal(manifest.name, '@deepseek-ai/dsh-runtime-pulse')
  assert.equal(manifest.dsh.client.immediately, true)
  assert.match(client, /useProjection\('sessionStats'\)/)
  assert.match(client, /useProjection\('tokenUsage'\)/)
  assert.doesNotMatch(client, /fetch\(|localStorage|sessionStorage|setInterval/)
})

test('reads durable projections from the current composer dock contract', () => {
  assert.match(client, /function RuntimePulse\(\{ useSession, useProjection \}\)/)
  assert.doesNotMatch(client, /useChat\(/)
  assert.doesNotMatch(client, /snapshot\.legacy\.nodes|snapshot\.chat\.legacy/)
})

test('cleanly shadows the native stats cell and releases it on unload', () => {
  assert.match(client, /name:'conversation\.composer\.dock', id:'stats', order:0, priority:-10/)
  assert.match(client, /ctx\.effect\(\(\) => \(\) => \{ style\.remove\(\) \}\)/)
})

test('keeps the default line compact and moves complete facts into click details', () => {
  for (const text of ['轮 · ', 'tok/s', '缓存 ', ' → ', '本会话运行详情', '模型', '工具', '首 token 平均', '缓存读取', '缓存写入', '已就绪']) {
    assert.match(client, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(client, /'aria-expanded':open/)
  assert.match(client, /event\.key === 'Escape'/)
  assert.match(client, /document\.addEventListener\('pointerdown', outside\)/)
  assert.match(client, /@container \(max-width:520px\)/)
  assert.match(client, /\.rp-root \{[^\n]*display:flex; justify-content:center;/)
  assert.match(client, /\.rp-trigger \{[^\n]*display:inline-flex;[^\n]*width:auto; max-width:100%;/)
  assert.doesNotMatch(client, /\.rp-trigger \{[^\n]*gap:0; width:100%;/)
})

test('offers a direct, real navigation request to Token Overview', () => {
  assert.match(client, /Token 总览/)
  assert.match(client, /new CustomEvent\('dsh:open-settings-section', \{ detail:\{ id:'token-overview' \} \}\)/)
  assert.match(client, /className:'rp-open-overview'/)
  assert.match(client, /setOpen\(false\)/)
})

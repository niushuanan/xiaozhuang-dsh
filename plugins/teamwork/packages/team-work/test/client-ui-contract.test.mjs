import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

describe('Teamwork client panel contract', () => {
  it('uses the shared two-person vector glyph for both Teamwork surfaces', () => {
    assert.match(client, /IconTeamworkOutline16/)
    assert.match(client, /React\.createElement\(IconTeamworkOutline16/)
    assert.doesNotMatch(client, /return React\.createElement\('img'/)
  })

  it('removes manual close and refresh controls from the panel', () => {
    assert.doesNotMatch(client, /className: 'teamwork-text-button'/)
    assert.doesNotMatch(client, /className: 'teamwork-text-button teamwork-refresh'/)
    assert.doesNotMatch(client, />关闭</)
  })

  it('refreshes the official subagent catalog every 15 seconds while open', () => {
    assert.match(client, /const AUTO_REFRESH_MS = 15000/)
    assert.match(client, /window\.setInterval\(syncCatalog, AUTO_REFRESH_MS\)/)
    assert.match(client, /window\.clearInterval\(id\)/)
    assert.match(client, /成员状态每 15 秒自动同步/)
  })

  it('closes on outside click and projects Codex/Z Code calls as members', () => {
    assert.match(client, /document\.addEventListener\('pointerdown', onPointerDown\)/)
    assert.match(client, /subagent_codex/)
    assert.match(client, /subagent_zcode/)
    assert.match(client, /externalRows\(session, externalSettings, now\)/)
    assert.match(client, /node\.isError === true \? 'failed' : 'inactive'/)
    assert.match(client, /row\.activity === 'failed' \? '失败'/)
    assert.doesNotMatch(client, /Teamwork 团队面板 · ' \+ label/)
  })

  it('reads the independent Teamwork projection instead of the permission preset', () => {
    assert.match(client, /useSessionProjection\(sessionId, 'teamwork'/)
    assert.match(client, /value\?\.active === true/)
    assert.doesNotMatch(client, /currentValue === 'team-work'/)
  })

  it('publishes and removes a client-lifetime marker for real hot-plug presence', () => {
    assert.match(client, /data-dsh-teamwork-capability/)
    assert.match(client, /dsh:teamwork-capability-change/)
    assert.match(client, /removeAttribute\(capabilityAttribute\)/)
  })

  it('separates the built-in execution pool from configurable external experts', () => {
    assert.match(client, /slots\.inject\('settings\.section'/)
    assert.match(client, /id: 'teamwork-settings'/)
    assert.match(client, /order: 21/)
    assert.match(client, /label: \(\) => 'Teamwork'/)
    assert.match(client, /产品原生子代理执行/)
    assert.match(client, /'Teamwork 外部专家'/)
    assert.match(client, /'外部专家'/)
    assert.match(client, /原生子代理无需配置/)
    assert.doesNotMatch(client, /外部智能体/)
  })

  it('presents automatic worktrees as concurrent worktree collaboration', () => {
    assert.match(client, /'并发 worktree 协作'/)
    assert.match(client, /并发 worktree 协作已开启，点击关闭/)
    assert.doesNotMatch(client, /多分支协作/)
    assert.doesNotMatch(client, /'自动并行开发'|并行开发已开启/)
  })

  it('backs collaborator switches, models, and reasoning with the live control API', () => {
    assert.match(client, /COLLABORATOR_API \+ '\/status'/)
    assert.match(client, /COLLABORATOR_API \+ '\/toggle'/)
    assert.match(client, /COLLABORATOR_API \+ '\/configure'/)
    assert.match(client, /role: 'switch'/)
    assert.match(client, /role: 'menuitemradio'/)
    assert.match(client, /event\.key === 'Escape'/)
    assert.match(client, /document\.addEventListener\('pointerdown'/)
    assert.match(client, /label: '思考'/)
  })

  it('reuses product logos at one optical size and avoids duplicate section lines', () => {
    assert.match(client, /assets\/codex-brand-v2\.png/)
    assert.match(client, /assets\/zcode-brand-v2\.png/)
    assert.doesNotMatch(client, /assets\/(?:codex|zcode)\.png/)
    assert.doesNotMatch(client, /z-ai\/static\/logo\.svg/)
    assert.match(client, /\.tw-settings-logo-slot \{[^\n]*width:36px; height:36px;[^\n]*overflow:visible;[^\n]*background:transparent; box-shadow:none;/)
    assert.match(client, /\.tw-settings-logo \{[^\n]*width:100%; height:100%;[^\n]*border-radius:8px;/)
    assert.match(client, /data-collaborator-id="codex"[^\n]*width:46px; height:46px; transform:translate\(-5px,-5px\)/)
    assert.doesNotMatch(client, /data-collaborator-id="zcode"[^\n]*background:/)
    assert.match(client, /SettingsSectionHeader/)
    assert.match(client, /React\.createElement\(SettingsSectionHeader/)
    assert.doesNotMatch(client, /tw-settings-head|tw-settings-title|tw-settings-intro/)
    assert.doesNotMatch(client, /tw-settings-hero|tw-settings-stats|Teamwork 概览|个原生执行池|个并发上限/)
    assert.match(client, /\.tw-settings-section-title::after/)
    assert.doesNotMatch(client, /\.tw-settings-list \{[^\n]*(border-top|border-bottom)/)
  })
})

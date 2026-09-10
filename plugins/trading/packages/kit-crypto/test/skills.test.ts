/**
 * kit-crypto skill provider：名册与按名分发。
 */
import { describe, expect, it } from 'vitest'
import { provider, providerForSkills } from '../src/index.ts'
import { provider as cnProvider } from '../../kit-cn/src/index.ts'
import { provider as hkProvider } from '../../kit-hk/src/index.ts'
import { provider as usProvider } from '../../kit-us/src/index.ts'

describe('kit-crypto skill provider', () => {
  it('list 返回全部候选（risk-checklist + instrument-analysis + indicator-authoring + trading-strategy-paradigms + knowledge-curation + trading-notes-setup），名字唯一', async () => {
    const list = await provider.list()
    expect(list.map((c) => c.name)).toEqual([
      'crypto-risk-checklist',
      'crypto-instrument-analysis',
      'indicator-authoring',
      'trading-strategy-paradigms',
      'knowledge-curation',
      'trading-notes-setup',
    ])
  })

  it('get 按名分发：各个 skill 的 content 都真实可读', async () => {
    for (const name of [
      'crypto-risk-checklist',
      'crypto-instrument-analysis',
      'indicator-authoring',
      'trading-strategy-paradigms',
      'knowledge-curation',
      'trading-notes-setup',
    ]) {
      const skill = await provider.get({ name, provider: 'dsh-trading-crypto' } as never)
      expect(skill.name).toBe(name)
      expect(skill.content.length).toBeGreaterThan(100)
    }
  })

  it('get 未知名字回落 risk-checklist（防御）', async () => {
    const skill = await provider.get({ name: 'nonexistent' } as never)
    expect(skill.name).toBe('crypto-risk-checklist')
  })

  it('providerForSkills 按白名单收窄：名单外 get 拒绝、未知名 fail-fast、缺省全量', async () => {
    const scoped = providerForSkills(['crypto-instrument-analysis', 'trading-notes-setup'])
    expect((await scoped.list()).map((c) => c.name)).toEqual(['crypto-instrument-analysis', 'trading-notes-setup'])
    expect((await scoped.get({ name: 'crypto-instrument-analysis' } as never)).name).toBe('crypto-instrument-analysis')
    await expect(scoped.get({ name: 'crypto-risk-checklist' } as never)).rejects.toThrow('not in whitelist')
    expect(() => providerForSkills(['no-such-skill'])).toThrow('unknown skills in whitelist')
    expect(providerForSkills()).toBe(provider)
  })
})

// Upstream stock-market assets contained only unresolved path text.
it.each([
  ['cn', cnProvider],
  ['hk', hkProvider],
  ['us', usProvider],
] as const)('%s risk checklist loads the actual execution review', async (market, skills) => {
  const candidate = (await skills.list()).find(item => item.name === `${market}-risk-checklist`)!
  const skill = await skills.get(candidate)
  expect(skill.content).toContain('holdings_list')
  expect(skill.content).toContain('dryRun=true')
  expect(skill.content).toContain('host approval gate')
  expect(skill.content.trim()).not.toMatch(/^\.\.\//)
})

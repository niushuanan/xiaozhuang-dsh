import { describe, expect, it } from 'vitest'
import { codexQuotaRows, kimiQuotaUsed } from '../src/quota.ts'

describe('KIMI quota mapping', () => {
  it('derives used quota from limit and remaining after a reset', () => {
    expect(kimiQuotaUsed({ limit: 100, remaining: 100 })).toBe(0)
    expect(kimiQuotaUsed({ limit: 100, remaining: 71 })).toBe(29)
  })
})

describe('GPT quota mapping', () => {
  it('keeps only the account weekly window and converts reset seconds to ISO time', () => {
    expect(codexQuotaRows({
      primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1_800_000_000 },
      secondary: { usedPercent: 68, windowDurationMins: 10_080, resetsAt: 1_800_604_800 },
    })).toEqual([{ key: 'weekly', percentUsed: 68, resetAt: '2027-01-22T08:00:00.000Z' }])
  })

  it('does not mislabel an unknown Codex bucket', () => {
    expect(codexQuotaRows({
      primary: { usedPercent: 30, windowDurationMins: 60, resetsAt: 1_800_000_000 },
    })).toEqual([])
  })

})

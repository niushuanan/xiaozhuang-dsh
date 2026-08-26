// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ComponentType } from 'react'
import { readFileSync } from 'node:fs'
import { QuotaAction } from '../src/client/QuotaAction.tsx'
import { BRAND_LOGOS } from '../src/client/brandAssets.ts'
import { zh } from '../src/client/locales.ts'
import type {} from '../src/client/index.ts'

const t: Parameters<typeof QuotaAction>[0]['t'] = makeTranslate(zh)
const TestQuotaAction = QuotaAction as ComponentType<{ t: typeof t }>
const styles = readFileSync('packages/client/ui-provider-quota/src/client/QuotaAction.module.css', 'utf8')
const snapshot = {
  updatedAt: Date.parse('2026-08-23T15:43:00Z'),
  providers: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      kind: 'money',
      status: 'ok',
      money: { currency: 'CNY', total: 138.83, toppedUp: 138.83, granted: 0 },
    },
    {
      id: 'kimi',
      name: 'Kimi Code',
      kind: 'quota',
      status: 'ok',
      plan: 'Allegro',
      quotas: [
        { key: 'rolling-5h', used: 0, limit: 100, resetAt: '2026-08-22T21:31:59.416Z' },
        { key: 'weekly', used: 49, limit: 100, resetAt: '2026-08-28T00:31:59.416Z' },
      ],
    },
    {
      id: 'zai',
      name: 'GLM',
      kind: 'quota',
      status: 'ok',
      plan: 'pro',
      quotas: [
        { key: 'tokens-5h', percentUsed: 0 },
        { key: 'tokens-weekly', percentUsed: 81, resetAt: '2026-08-25T01:59:59.997Z' },
      ],
    },
    {
      id: 'codex',
      name: 'GPT',
      kind: 'quota',
      status: 'ok',
      plan: 'pro',
      quotas: [
        { key: 'weekly', percentUsed: 52, resetAt: '2026-08-27T03:47:58.000Z' },
      ],
    },
  ],
} as const

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('QuotaAction', () => {
  it('waits until the user opens the panel, then caches and refreshes on demand', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    } as Response)
    render(<TestQuotaAction t={t} />)
    const trigger = screen.getByRole('button', { name: '模型用量' })
    expect(trigger.querySelector('svg')?.getAttribute('width')).toBe('14')
    expect(trigger.querySelector('svg')?.getAttribute('height')).toBe('14')
    expect(trigger.querySelector('img')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '模型用量' }))
    await waitFor(() => { expect(fetchMock).toHaveBeenCalledWith(
      '/plugins/ui-provider-quota/api/usage',
      { cache: 'no-store' },
    ) })

    expect(await screen.findByRole('dialog', { name: '模型用量概览' })).toBeTruthy()
    expect(screen.getByText('DeepSeek')).toBeTruthy()
    expect(screen.getByText('KIMI')).toBeTruthy()
    expect(screen.getByText('GLM')).toBeTruthy()
    expect(screen.getByText('GPT')).toBeTruthy()
    expect(screen.getByText('ALLEGRO')).toBeTruthy()
    expect(screen.getByText('PRO · 20X')).toBeTruthy()
    expect(Array.from(document.querySelectorAll('[data-provider-id]')).map(node => node.getAttribute('data-provider-id'))).toEqual([
      'deepseek', 'kimi', 'zai', 'codex',
    ])
    expect(screen.getByText('每 5 分钟自动刷新')).toBeTruthy()
    expect(screen.getByText('¥138.83')).toBeTruthy()
    expect(screen.queryByText(/Cash|Bonus/)).toBeNull()
    expect(screen.getAllByText('0%').length).toBe(2)
    expect(screen.getAllByRole('progressbar')).toHaveLength(5)
    expect(screen.getAllByRole('progressbar', { name: '5 小时已用，0%' })).toHaveLength(2)
    expect(screen.getByText('8/28 08:31 重置')).toBeTruthy()
    expect(screen.getByText('8/25 09:59 重置')).toBeTruthy()
    expect(screen.getByText('8/27 11:47 重置')).toBeTruthy()
    expect(screen.getByText('未使用，暂无重置')).toBeTruthy()
    expect(screen.getByText('重置时间为北京时间')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '返回' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/plugins/ui-provider-quota/api/usage?force=1',
      { cache: 'no-store' },
    )

    fireEvent.click(screen.getByRole('button', { name: '刷新用量' }))
    await waitFor(() => { expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/plugins/ui-provider-quota/api/usage?force=1') })

    fireEvent.click(screen.getByRole('button', { name: '模型用量' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: '模型用量' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('uses one rounded-square frame contract for every provider logo', () => {
    expect(BRAND_LOGOS.zai).toBe('/plugins/ui-provider-quota/api/assets/zcode.png')
    expect(styles).toMatch(
      /\.logoFrame \{[\s\S]*?width: 34px;[\s\S]*?height: 34px;[\s\S]*?padding: 0;[\s\S]*?border-radius: 8px;[\s\S]*?box-shadow: inset/,
    )
    expect(styles).toMatch(
      /\.logoFrame\[data-provider-id='kimi'\],[\s\S]*?\.logoFrame\[data-provider-id='zai'\][\s\S]*?background: #242424;/,
    )
    expect(styles).toMatch(/\.logo \{[\s\S]*?width: 28px;[\s\S]*?height: 28px;[\s\S]*?border-radius: 0;/)
  })
})

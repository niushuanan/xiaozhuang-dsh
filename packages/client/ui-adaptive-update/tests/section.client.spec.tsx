// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AdaptiveUpdateSection } from '../src/client/AdaptiveUpdateSection.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('自适应更新 Settings page', () => {
  it('uses the exact title and starts a background review without replacing the page', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ phase: 'idle', currentCommit: 'a'.repeat(40) }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          phase: 'discovering',
          jobId: 'job-1',
          workerPid: 42,
          currentCommit: 'a'.repeat(40),
          startedAt: '2026-08-26T00:00:00.000Z',
          updatedAt: '2026-08-26T00:00:00.000Z',
          checks: [],
        }),
      })
    vi.stubGlobal('fetch', fetch)

    render(<AdaptiveUpdateSection {...({ close: () => undefined } as PropsRuntime<'settings.section'>)} />)
    expect(screen.getByRole('heading', { name: '自适应更新' })).toBeTruthy()
    expect(screen.queryByText(/一句话介绍/u)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '开始自适应更新' }))
    await waitFor(() => { expect(screen.getByText('正在确认官方版本')).toBeTruthy() })
    expect(fetch).toHaveBeenCalledWith('/plugins/ui-adaptive-update/api/start', { method: 'POST' })
    expect(screen.getByText(/当前版本可继续使用/u)).toBeTruthy()
  })

  it('完成后将已应用的候选提交显示为当前版本', async () => {
    const previousCommit = 'a'.repeat(40)
    const candidateCommit = 'b'.repeat(40)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        phase: 'completed',
        jobId: 'job-1',
        workerPid: 42,
        currentCommit: previousCommit,
        candidateCommit,
        previousCommit,
        upstreamCommit: 'c'.repeat(40),
        startedAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T01:00:00.000Z',
        checks: [],
      }),
    }))

    render(<AdaptiveUpdateSection {...({ close: () => undefined } as PropsRuntime<'settings.section'>)} />)

    await waitFor(() => { expect(screen.getByText(candidateCommit.slice(0, 12))).toBeTruthy() })
    expect(screen.queryByText(previousCommit.slice(0, 12))).toBeNull()
  })
})

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemorySettings } from '../src/client/MemorySettings.tsx'
import { zh } from '../src/client/locales.ts'

const documents = {
  user: { kind: 'user', path: '/dsh/memory/user.md', exists: true, content: '用户记忆', revision: 'u1', canRestore: true },
  ai: { kind: 'ai', path: '/dsh/memory/ai.md', exists: true, content: 'AI 记忆', revision: 'a1', canRestore: false, updatedAt: '2026-08-25T04:00:00.000Z' },
  state: { lastMaintenanceCursor: 10, lastMaintenanceAt: '2026-08-25T04:00:00.000Z' },
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function translate(key: keyof typeof zh, params: Record<string, unknown> = {}): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params)) text = text.replace(`{${name}}`, String(value))
  return text
}

describe('MemorySettings', () => {
  it('edits both visible documents and revision-saves the active one', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(documents), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...documents.ai, content: 'AI 记忆已修订', revision: 'a2', canRestore: true,
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    render(<MemorySettings t={(key: string) => key} />)

    expect(await screen.findByDisplayValue('用户记忆')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'tab.ai' }))
    const editor = screen.getByRole('textbox', { name: 'editor.ai' })
    expect((editor as HTMLTextAreaElement).value).toBe('AI 记忆')
    fireEvent.change(editor, { target: { value: 'AI 记忆已修订' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(
      '/plugins/memory-system/api/documents/ai',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ content: 'AI 记忆已修订', revision: 'a1' }) }),
    ))
    expect(await screen.findByText('saved')).toBeTruthy()
  })

  it('restores the active document only after an explicit click', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(documents), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...documents.user, content: '上一版', revision: 'u2', canRestore: true,
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    render(<MemorySettings t={(key: string) => key} />)
    await screen.findByDisplayValue('用户记忆')
    fireEvent.click(screen.getByRole('button', { name: 'restore' }))
    expect(await screen.findByDisplayValue('上一版')).toBeTruthy()
    expect(fetch).toHaveBeenLastCalledWith(
      '/plugins/memory-system/api/documents/user/restore',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ revision: 'u1' }) }),
    )
  })

  it('keeps document navigation compact and hides controls that cannot act', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(documents), { status: 200 }),
    ))
    render(<MemorySettings t={(key: string) => key} />)

    await screen.findByDisplayValue('用户记忆')
    expect(screen.queryByText('description')).toBeNull()
    expect(screen.queryByText('hint.user')).toBeNull()

    const userTab = screen.getByRole('tab', { name: 'tab.user' })
    userTab.focus()
    fireEvent.keyDown(userTab, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'tab.ai' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByText('hint.ai')).toBeNull()
    expect(screen.queryByRole('button', { name: 'restore' })).toBeNull()
  })

  it('uses the native memory labels and shows only one relevant update time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(documents), { status: 200 }),
    ))
    render(<MemorySettings t={translate} />)

    await screen.findByDisplayValue('用户记忆')
    expect(screen.getByRole('tab', { name: '选中记忆' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'AI主动记忆' }))
    expect(screen.getAllByText(/^更新于/)).toHaveLength(1)
    expect(screen.queryByText(/最近自动维护/)).toBeNull()
  })

  it('offers the immediate AI-memory pass only on the AI tab and reports its outcome', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(documents), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'completed', changed: true, summary: '合并了两条重复项',
      }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify(documents), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    render(<MemorySettings t={(key: string) => key} />)

    await screen.findByDisplayValue('用户记忆')
    expect(screen.queryByRole('button', { name: 'organize' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'tab.ai' }))

    fireEvent.click(screen.getByRole('button', { name: 'organize' }))
    expect(await screen.findByText('organized')).toBeTruthy()
    expect(fetch).toHaveBeenNthCalledWith(2, '/plugins/memory-system/api/maintain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(fetch.mock.calls[2]?.[0]).toBe('/plugins/memory-system/api/documents')
  })

  it('surfaces the latest automatic-maintenance failure from the host state', async () => {
    const failed = {
      ...documents,
      state: {
        ...documents.state,
        lastMaintenanceError: { at: '2026-08-26T15:30:00.000Z', message: 'api key 无效' },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(failed), { status: 200 }),
    ))
    render(<MemorySettings t={translate} />)

    await screen.findByDisplayValue('用户记忆')
    fireEvent.click(screen.getByRole('tab', { name: 'AI主动记忆' }))
    const alert = await screen.findAllByRole('alert')
    expect(alert.some(node => node.textContent.includes('api key 无效'))).toBe(true)
  })

  it('shows a retry action when the first document load fails', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: '暂时不可用' }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(documents), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    render(<MemorySettings t={(key: string) => key} />)

    expect((await screen.findByRole('alert')).textContent).toContain('暂时不可用')
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(await screen.findByDisplayValue('用户记忆')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

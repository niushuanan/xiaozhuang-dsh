// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepSeekImportSection } from '../src/client/DeepSeekImportSection.tsx'
import type { DeepSeekImportResult } from '../src/deepseek-import-types.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DeepSeek import settings section', () => {
  it('uploads one official export, keeps a visible busy state, and refreshes the native Session list', async () => {
    let resolveImport!: (value: DeepSeekImportResult) => void
    const importFile = vi.fn(() => new Promise<DeepSeekImportResult>((resolve) => {
      resolveImport = resolve
    }))
    const refreshSessions = vi.fn(async () => {})
    render(<DeepSeekImportSection importFile={importFile} refreshSessions={refreshSessions} />)

    const file = new File(['[]'], 'deepseek-conversations.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('选择 DeepSeek 导出文件'), { target: { files: [file] } })

    expect((screen.getByRole('button', { name: '正在导入…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('正在解析并写入')
    resolveImport({ imported: 12, skipped: 2, failed: 0, sessionIds: [], errors: [] })
    await waitFor(() => { expect(refreshSessions).toHaveBeenCalledOnce() })
    expect(screen.getByRole('status').textContent).toContain('已导入 12 个对话')
    expect(screen.getByRole('status').textContent).toContain('跳过 2 个已存在对话')
  })

  it('shows an actionable error and lets the user choose another file', async () => {
    const importFile = vi.fn(async () => { throw new Error('不是有效的 DeepSeek 导出文件') })
    render(<DeepSeekImportSection importFile={importFile} refreshSessions={async () => {}} />)

    fireEvent.change(screen.getByLabelText('选择 DeepSeek 导出文件'), {
      target: { files: [new File(['{}'], 'wrong.json', { type: 'application/json' })] },
    })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('不是有效的 DeepSeek 导出文件')
    })
    expect((screen.getByRole('button', { name: '选择导出文件' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

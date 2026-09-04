// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeepSeekImportSection } from '../src/client/DeepSeekImportSection.tsx'
import type {
  DeepSeekImportPreview,
  DeepSeekImportResult,
} from '../src/deepseek-import-types.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DeepSeek import settings section', () => {
  it('previews every conversation before importing only the checked available rows', async () => {
    let resolvePreview!: (value: DeepSeekImportPreview) => void
    const previewFile = vi.fn(() => new Promise<DeepSeekImportPreview>((resolve) => {
      resolvePreview = resolve
    }))
    let resolveImport!: (value: DeepSeekImportResult) => void
    const importSelection = vi.fn(() => new Promise<DeepSeekImportResult>((resolve) => {
      resolveImport = resolve
    }))
    const refreshSessions = vi.fn(async () => {})
    render(<DeepSeekImportSection
      previewFile={previewFile}
      importSelection={importSelection}
      refreshSessions={refreshSessions}
    />)

    const file = new File(['[]'], 'deepseek-conversations.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('选择 DeepSeek 导出文件'), { target: { files: [file] } })

    expect((screen.getByRole('button', { name: '正在解析…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('正在解析对话窗口')
    resolvePreview({
      total: 3,
      available: 2,
      imported: 1,
      conversations: [
        {
          sourceId: 'new-finance', title: '财务复盘', createdAt: 1_777_000_000_000,
          updatedAt: 1_777_000_010_000, messageCount: 8, reasoningCount: 3, imported: false,
        },
        {
          sourceId: 'existing-product', title: '产品讨论', createdAt: 1_776_000_000_000,
          updatedAt: 1_776_000_010_000, messageCount: 5, reasoningCount: 0, imported: true,
        },
        {
          sourceId: 'new-trip', title: '旅行计划', createdAt: 1_775_000_000_000,
          updatedAt: 1_775_000_010_000, messageCount: 4, reasoningCount: 1, imported: false,
        },
      ],
    })

    await screen.findByRole('heading', { name: '选择要导入的对话' })
    expect(screen.getByText('3 个对话窗口')).toBeTruthy()
    expect(screen.getByText('1 个已导入')).toBeTruthy()
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '选择 财务复盘' }).checked).toBe(true)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '选择 旅行计划' }).checked).toBe(true)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '选择 产品讨论' }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 旅行计划' }))
    fireEvent.click(screen.getByRole('button', { name: '导入 1 个对话' }))

    expect(importSelection).toHaveBeenCalledWith(file, ['new-finance'])
    expect(screen.getByRole('status').textContent).toContain('正在导入所选对话')
    resolveImport({ imported: 1, skipped: 0, failed: 0, sessionIds: [], errors: [] })
    await waitFor(() => { expect(refreshSessions).toHaveBeenCalledOnce() })
    expect(screen.getByRole('status').textContent).toContain('已导入 1 个对话')
  })

  it('filters a long preview and bulk-selects only the current available results', async () => {
    const previewFile = vi.fn(async (): Promise<DeepSeekImportPreview> => ({
      total: 3,
      available: 3,
      imported: 0,
      conversations: [
        { sourceId: 'finance-1', title: '财务周报', createdAt: 1, updatedAt: 4, messageCount: 2, reasoningCount: 0, imported: false },
        { sourceId: 'product-1', title: '产品路线', createdAt: 2, updatedAt: 5, messageCount: 4, reasoningCount: 1, imported: false },
        { sourceId: 'finance-2', title: '财务预算', createdAt: 3, updatedAt: 6, messageCount: 6, reasoningCount: 2, imported: false },
      ],
    }))
    render(<DeepSeekImportSection
      previewFile={previewFile}
      importSelection={async () => ({ imported: 0, skipped: 0, failed: 0, sessionIds: [], errors: [] })}
      refreshSessions={async () => {}}
    />)

    fireEvent.change(screen.getByLabelText('选择 DeepSeek 导出文件'), {
      target: { files: [new File(['[]'], 'deepseek.json', { type: 'application/json' })] },
    })
    await screen.findByRole('heading', { name: '选择要导入的对话' })
    fireEvent.click(screen.getByRole('button', { name: '清空选择' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索对话' }), { target: { value: '财务' } })
    expect(screen.queryByText('产品路线')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '全选当前结果' }))
    expect(screen.getByRole('button', { name: '导入 2 个对话' })).toBeTruthy()
  })

  it('shows an actionable preview error and lets the user choose another file', async () => {
    const previewFile = vi.fn(async () => { throw new Error('不是有效的 DeepSeek 导出文件') })
    render(<DeepSeekImportSection
      previewFile={previewFile}
      importSelection={async () => ({ imported: 0, skipped: 0, failed: 0, sessionIds: [], errors: [] })}
      refreshSessions={async () => {}}
    />)

    fireEvent.change(screen.getByLabelText('选择 DeepSeek 导出文件'), {
      target: { files: [new File(['{}'], 'wrong.json', { type: 'application/json' })] },
    })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('不是有效的 DeepSeek 导出文件')
    })
    expect((screen.getByRole('button', { name: '重新选择' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

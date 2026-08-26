// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PluginCatalogSection, type PluginCatalogInjected } from '../src/client/PluginCatalogSection.tsx'

afterEach(cleanup)

const status = {
  plugins: [
    { id: 'computer-use', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'teamwork', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'parallel-development', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'vision', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'product-companion', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'plain-chat', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'multi-window', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'selection-actions', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'memory-system', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'model-usage', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'runtime-pulse', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'adaptive-update', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'token-overview', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'fluent-output', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'session-modes', enabled: true, phase: 'active' as const, missing: [] },
    { id: 'skill-manager', enabled: true, phase: 'active' as const, missing: [] },
  ],
  updatedAt: '2026-08-26T00:00:00.000Z',
}

function injected(): PluginCatalogInjected {
  return {
    loadStatus: vi.fn().mockResolvedValue(status),
    togglePlugin: vi.fn().mockResolvedValue(status),
    exportPlugins: vi.fn().mockResolvedValue({
      blob: new Blob(['zip'], { type: 'application/zip' }),
      filename: 'xiaozhuang-dsh-plugins.zip',
    }),
    saveArchive: vi.fn(),
  }
}

describe('plugin catalog export selection', () => {
  it('shows the repository URL as an explicit safe link with a click hint', async () => {
    const api = injected()
    render(<PluginCatalogSection {...api} />)
    await screen.findByText('16')

    const link = screen.getByRole('link', {
      name: 'https://github.com/niushuanan/xiaozhuang-dsh（点击打开 ↗）',
    })
    expect(link.getAttribute('href')).toBe('https://github.com/niushuanan/xiaozhuang-dsh')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('selects one plugin inline and exports only that plugin', async () => {
    const api = injected()
    render(<PluginCatalogSection {...api} />)
    await screen.findByText('16')
    expect(screen.getByText('Skill 管理')).toBeTruthy()
    expect(screen.getByText('持续适配')).toBeTruthy()
    expect(screen.getByText('长期记忆')).toBeTruthy()
    expect(screen.queryByText('命令、插件与技能')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '导出插件' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Teamwork' }))
    fireEvent.click(screen.getByRole('button', { name: '导出 1 个插件' }))

    await waitFor(() => expect(api.exportPlugins).toHaveBeenCalledWith(['teamwork']))
    expect(api.saveArchive).toHaveBeenCalledWith(expect.objectContaining({ filename: 'xiaozhuang-dsh-plugins.zip' }))
    expect(screen.getByRole('status').textContent).toContain('已导出 1 个插件')
  })

  it('defines select all as the entire catalog even while search hides most rows', async () => {
    const api = injected()
    render(<PluginCatalogSection {...api} />)
    await screen.findByText('16')
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索插件' }), { target: { value: 'Teamwork' } })
    fireEvent.click(screen.getByRole('button', { name: '导出插件' }))
    fireEvent.click(screen.getByRole('button', { name: '全选 16 个' }))

    expect(screen.getByText('已选 16 个')).toBeTruthy()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '导出 16 个插件' }))
    await waitFor(() => {
      const exported = (api.exportPlugins as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as readonly string[]
      expect(new Set(exported)).toEqual(new Set(status.plugins.map(plugin => plugin.id)))
    })
  })

  it('cancels selection without changing plugin state', async () => {
    const api = injected()
    render(<PluginCatalogSection {...api} />)
    await screen.findByText('16')
    fireEvent.click(screen.getByRole('button', { name: '导出插件' }))
    const row = screen.getByText('Computer Use').closest('li')!
    fireEvent.click(within(row).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '取消导出' }))

    expect(screen.queryByRole('checkbox', { name: '选择 Computer Use' })).toBeNull()
    expect(screen.getAllByRole('switch')).toHaveLength(16)
    expect(api.togglePlugin).not.toHaveBeenCalled()
  })
})

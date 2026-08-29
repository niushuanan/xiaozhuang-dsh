// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SettingsSectionHeader } from '../src/SettingsSectionHeader.tsx'

afterEach(cleanup)

describe('SettingsSectionHeader', () => {
  it('owns the shared settings title, description, and action contract', () => {
    const { container } = render(
      <SettingsSectionHeader
        title="侧边卡片"
        description="管理侧边卡片的显示内容与默认行为"
        actions={<button type="button">页面操作</button>}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: '侧边卡片' })).toBeTruthy()
    expect(screen.getByText('管理侧边卡片的显示内容与默认行为')).toBeTruthy()
    expect(screen.getByRole('button', { name: '页面操作' })).toBeTruthy()
    expect(container.querySelector('[data-settings-section-header="true"]')).toBeTruthy()
  })

  it('uses a supplied title id without requiring description or actions', () => {
    const { container } = render(<SettingsSectionHeader title="模型" titleId="models-title" />)

    expect(screen.getByRole('heading', { level: 2, name: '模型' }).id).toBe('models-title')
    expect(container.querySelector('[data-settings-section-header="true"] p')).toBeNull()
  })

  it('keeps a title-local control beside the heading', () => {
    render(
      <SettingsSectionHeader
        title="鲸少女"
        titleAdornment={<button type="button">修改名称</button>}
      />,
    )

    const heading = screen.getByRole('heading', { level: 2, name: '鲸少女' })
    const edit = screen.getByRole('button', { name: '修改名称' })
    expect(heading.parentElement).toBe(edit.parentElement)
  })
})

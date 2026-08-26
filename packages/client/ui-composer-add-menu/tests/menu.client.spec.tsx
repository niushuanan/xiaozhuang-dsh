// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ComposerAddMenu } from '../src/client/ComposerAddMenu.tsx'

afterEach(cleanup)

function renderMenu(mode: 'work' | 'chat' = 'work') {
  const onInsertSlashItem = vi.fn()
  const onAddTextFiles = vi.fn(() => Promise.resolve())
  render(<ComposerAddMenu
    mode={mode}
    disabled={false}
    commandMenuOpen={false}
    canAddImages={true}
    imageMediaTypes={['image/png']}
    commandItems={[
      { name: 'browser', description: '用隔离浏览器完成网页任务' },
      { name: 'goal', description: '设置持续追踪的目标' },
    ]}
    slashItems={['browser', 'image-vision']}
    canReferenceFiles={true}
    onToggleCommandMenu={vi.fn()}
    onToggleReferenceMenu={vi.fn()}
    onInsertSlashItem={onInsertSlashItem}
    onAddImages={vi.fn()}
    onAddTextFiles={onAddTextFiles}
    focusInput={vi.fn()}
  />)
  fireEvent.click(screen.getByRole('button', { name: '添加' }))
  return { onInsertSlashItem, onAddTextFiles }
}

describe('native composer add menu', () => {
  it('shows official commands before skills in one command, plugin and skill directory', () => {
    renderMenu()
    const menu = screen.getByRole('menu', { name: '命令、插件与技能' })
    expect(menu.textContent).toContain('命令、插件与技能')
    const labels = screen.getAllByRole('menuitem').map(item => item.textContent)
    expect(labels).toEqual([
      '图片文件选择要发送的图片',
      '文件与文件夹从当前工作区引用',
      'browser用隔离浏览器完成网页任务',
      'goal设置持续追踪的目标',
      'image-vision调用 /image-vision',
    ])
  })

  it('inserts the selected official command without executing it', () => {
    const { onInsertSlashItem: insert } = renderMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /browser/ }))
    expect(insert).toHaveBeenCalledExactlyOnceWith('browser')
  })

  it('shows only image and text-file uploads in plain chat', () => {
    renderMenu('chat')
    const menu = screen.getByRole('menu', { name: '上传文件与图片' })
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      '上传图片选择要发送的图片',
      '上传文件文本、Markdown、表格与代码',
    ])
    expect(menu.textContent).not.toContain('命令、插件与技能')
    expect(menu.textContent).not.toContain('当前工作区')
  })
})

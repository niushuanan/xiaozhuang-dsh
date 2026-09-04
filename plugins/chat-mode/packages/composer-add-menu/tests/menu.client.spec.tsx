// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ComposerAddMenu } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

function renderMenu(mode: 'work' | 'chat' = 'work', webSearchEnabled = true) {
  const onInsertSlashItem = vi.fn()
  const onAddTextFiles = vi.fn(() => Promise.resolve())
  const onToggleReferenceMenu = vi.fn()
  const onSetWebSearchEnabled = vi.fn()
  render(<ComposerAddMenu
    mode={mode}
    webSearchEnabled={webSearchEnabled}
    t={(key, params) => (zh[key as keyof typeof zh] ?? key).replace(
      '{name}', typeof params?.name === 'string' ? params.name : '',
    )}
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
    onToggleReferenceMenu={onToggleReferenceMenu}
    onInsertSlashItem={onInsertSlashItem}
    onAddImages={vi.fn()}
    onAddTextFiles={onAddTextFiles}
    onSetWebSearchEnabled={onSetWebSearchEnabled}
    focusInput={vi.fn()}
  />)
  fireEvent.click(screen.getByRole('button', { name: '添加' }))
  return { onInsertSlashItem, onAddTextFiles, onToggleReferenceMenu, onSetWebSearchEnabled }
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

  it('opens the current Workspace file and folder reference picker', () => {
    const { onToggleReferenceMenu } = renderMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /文件与文件夹/ }))
    expect(onToggleReferenceMenu).toHaveBeenCalledOnce()
  })

  it('shows only image and text-file uploads plus an enabled web-search capsule in plain chat', () => {
    const { onSetWebSearchEnabled } = renderMenu('chat')
    const menu = screen.getByRole('menu', { name: '上传文件与图片' })
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      '上传图片选择要发送的图片',
      '上传文件文本、Markdown、表格与代码',
    ])
    expect(menu.textContent).not.toContain('命令、插件与技能')
    expect(menu.textContent).not.toContain('当前工作区')
    const web = screen.getByRole('button', { name: '联网搜索已开启' })
    expect(web.textContent).toBe('联网搜索')
    expect(web.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(web)
    expect(onSetWebSearchEnabled).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('can turn web search back on from the inactive capsule', () => {
    const { onSetWebSearchEnabled } = renderMenu('chat', false)
    const web = screen.getByRole('button', { name: '联网搜索已关闭' })
    expect(web.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(web)
    expect(onSetWebSearchEnabled).toHaveBeenCalledExactlyOnceWith(true)
  })
})

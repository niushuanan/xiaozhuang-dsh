// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SkillManagerSection, type SkillManagerInjected } from '../src/client/SkillManagerSection.tsx'

afterEach(cleanup)

function injected(): SkillManagerInjected {
  return {
    listSkills: vi.fn().mockResolvedValue({ skills: [
      { name: 'personal-report', description: 'Build reports', source: 'user-dsh', sourceGroup: 'personal', writable: true, provider: 'filesystem' },
      { name: 'project-review', description: 'Review code', source: 'project-dsh', sourceGroup: 'project', writable: false, provider: 'filesystem' },
    ] }),
    loadSkill: vi.fn().mockResolvedValue({
      name: 'personal-report', description: 'Build reports', source: 'user-dsh', sourceGroup: 'personal', writable: true, provider: 'filesystem',
      explanation: 'Build reports from source material and keep the result easy to review.\n\nUse this Skill when a user needs a structured report with source-aware conclusions.',
      files: [
        { path: 'SKILL.md', kind: 'markdown', size: 82, content: '---\nname: personal-report\ndescription: Build reports\n---\n\n# Report' },
        { path: 'references/guide.ts', kind: 'code', size: 12, content: 'export {}' },
      ],
    }),
    importSource: vi.fn().mockResolvedValue({ installed: 'new-skill', replaced: false }),
  }
}

describe('Skill settings page', () => {
  it('opens one Skill in the same page and switches file previews', async () => {
    const api = injected()
    render(<SkillManagerSection {...api} />)
    expect(screen.getByRole('heading', { name: 'Skill 管理' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /personal-report/ }))
    expect(await screen.findByText(/Build reports from source material/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'personal-report 介绍' })).toBeTruthy()
    const intro = screen.getByRole('button', { name: '展开介绍' })
    expect(intro.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(intro)
    expect(intro.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Report' })).toBeTruthy()
    expect(screen.queryByText('name: personal-report')).toBeNull()
    fireEvent.click(screen.getByRole('treeitem', { name: /guide.ts/ }))
    expect(screen.getByText('export {}')).toBeTruthy()
    expect(screen.getByRole('button', { name: '返回全部 Skill' })).toBeTruthy()
    expect(screen.getByText('个人 · 可写')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回全部 Skill' }))
    expect(screen.getByRole('button', { name: /personal-report/ })).toBeTruthy()
    expect(screen.getByText('只读')).toBeTruthy()
  })

  it('imports a browser folder with webkit relative paths and refreshes the list', async () => {
    const api = injected()
    render(<SkillManagerSection {...api} />)
    await screen.findByText('personal-report')
    fireEvent.click(screen.getByRole('button', { name: '导入 Skill' }))
    const menu = screen.getByRole('menu')
    expect(menu).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '导入文件' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '导入文件夹' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '从 GitHub 导入' })).toBeTruthy()
    const file = new File(['---\nname: new-skill\n---'], 'SKILL.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'webkitRelativePath', { value: 'new-skill/SKILL.md' })
    const input = screen.getByLabelText('导入 Skill 文件夹')
    expect(input.getAttribute('webkitdirectory')).not.toBeNull()
    const chooseFolder = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('menuitem', { name: '导入文件夹' }))
    expect(chooseFolder).toHaveBeenCalledOnce()
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => {
      expect(api.importSource).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'files', files: [expect.objectContaining({ path: 'new-skill/SKILL.md' })],
      }))
    })
    expect((await screen.findByRole('status')).textContent).toContain('已安装 new-skill')
    expect(api.listSkills).toHaveBeenCalledTimes(2)
  })

  it('reveals the GitHub form only after choosing that import source', async () => {
    const api = injected()
    render(<SkillManagerSection {...api} />)
    await screen.findByText('personal-report')
    expect(screen.queryByLabelText('GitHub 仓库 URL')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '导入 Skill' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '从 GitHub 导入' }))
    const input = screen.getByLabelText('GitHub 仓库 URL')
    fireEvent.change(input, { target: { value: 'https://github.com/acme/useful-skill' } })
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))
    await waitFor(() => {
      expect(api.importSource).toHaveBeenCalledWith({
        kind: 'github', url: 'https://github.com/acme/useful-skill',
      })
    })
  })
})

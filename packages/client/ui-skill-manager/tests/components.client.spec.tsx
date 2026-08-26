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
      explanation: 'Build reports',
      files: [
        { path: 'SKILL.md', kind: 'markdown', size: 42, content: '# Report' },
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
    expect(await screen.findByText('Build reports')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Report' })).toBeTruthy()
    fireEvent.click(screen.getByRole('treeitem', { name: /guide.ts/ }))
    expect(screen.getByText('export {}')).toBeTruthy()
    expect(screen.getByText('可写')).toBeTruthy()
    expect(screen.getByText('只读')).toBeTruthy()
  })

  it('imports a browser folder with webkit relative paths and refreshes the list', async () => {
    const api = injected()
    render(<SkillManagerSection {...api} />)
    await screen.findByText('personal-report')
    const file = new File(['---\nname: new-skill\n---'], 'SKILL.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'webkitRelativePath', { value: 'new-skill/SKILL.md' })
    const input = screen.getByLabelText('导入 Skill 文件夹')
    expect(input.getAttribute('webkitdirectory')).not.toBeNull()
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(api.importSource).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'files', files: [expect.objectContaining({ path: 'new-skill/SKILL.md' })],
    })))
    expect((await screen.findByRole('status')).textContent).toContain('已安装 new-skill')
    expect(api.listSkills).toHaveBeenCalledTimes(2)
  })
})

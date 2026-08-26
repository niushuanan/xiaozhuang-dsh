import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listManagedSkills, readManagedSkill } from '../src/catalog.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('Skill catalog projection', () => {
  it('labels every source and makes only personal sources writable', async () => {
    const service = {
      list: async () => [
        { name: 'mine', description: 'Mine', source: 'user-dsh', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
        { name: 'project-one', description: 'Project', source: 'project-dsh', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
        { name: 'live', description: 'Runtime', source: 'runtime', provider: 'runtime', invocation: { modelInvocable: true, userInvocable: true } },
        { name: 'built-in', description: 'Bundled', source: 'bundled', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
      ],
      get: async () => undefined,
    }
    const skills = await listManagedSkills(service, '/project')
    expect(skills.map(skill => [skill.name, skill.sourceGroup, skill.writable])).toEqual([
      ['built-in', 'bundled', false],
      ['live', 'runtime', false],
      ['mine', 'personal', true],
      ['project-one', 'project', false],
    ])
  })

  it('returns a safe file tree with Markdown, image, and binary previews', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-skill-detail-'))
    roots.push(root)
    await mkdir(join(root, 'assets'))
    await writeFile(join(root, 'SKILL.md'), '---\nname: visual\ndescription: Visual\n---\n\n# Visual')
    await writeFile(join(root, 'assets/pixel.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    await writeFile(join(root, 'assets/archive.bin'), Buffer.from([0, 1, 2]))
    const definition = {
      name: 'visual', description: 'Visual', content: '# Visual', source: 'user-dsh', provider: 'filesystem',
      invocation: { modelInvocable: true, userInvocable: true }, path: join(root, 'SKILL.md'),
      resourceBase: { kind: 'directory' as const, path: root },
    }
    const detail = await readManagedSkill({ list: async () => [], get: async () => definition }, '/project', 'visual')
    expect(detail.files.find(file => file.path === 'SKILL.md')).toMatchObject({ kind: 'markdown', content: expect.stringContaining('# Visual') })
    expect(detail.files.find(file => file.path === 'assets/pixel.png')).toMatchObject({ kind: 'image', dataUrl: expect.stringMatching(/^data:image\/png;base64,/) })
    expect(detail.files.find(file => file.path === 'assets/archive.bin')).toMatchObject({ kind: 'binary', size: 3 })
  })
})

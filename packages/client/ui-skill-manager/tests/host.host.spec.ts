import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importPersonalSkill, isLoopbackRequest, parseSkillImportRequest, resolveSessionSkillView } from '../src/index.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('Skill Host API security', () => {
  it('accepts only loopback same-origin requests and validates import request variants', () => {
    expect(isLoopbackRequest({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' } })).toBe(true)
    expect(isLoopbackRequest({ headers: { host: 'example.com', 'sec-fetch-site': 'same-origin' } })).toBe(false)
    expect(isLoopbackRequest({ headers: { host: 'localhost:3080', 'sec-fetch-site': 'cross-site' } })).toBe(false)
    expect(parseSkillImportRequest({ kind: 'github', url: 'https://github.com/acme/demo' })).toEqual({ kind: 'github', url: 'https://github.com/acme/demo' })
    expect(() => parseSkillImportRequest({ kind: 'files', files: [{ path: '../bad', contentBase64: '' }] })).toThrow('path')
  })

  it('resolves the same session-scoped Skill registry and cwd used by the composer', () => {
    const globalSkills = { list: vi.fn(), get: vi.fn() }
    const scopedSkills = { list: vi.fn(), get: vi.fn() }
    const agent = { id: 'session-1', ctx: {} }
    const ctx = {
      skills: globalSkills,
      sessions: { get: (id: string) => id === 'session-1' ? { header: { cwd: '/workspace/current' } } : undefined },
      agents: { get: (id: string) => id === 'session-1' ? agent : undefined },
      agentPresets: { serviceFor: (owner: unknown, name: string) => owner === agent && name === 'skills' ? scopedSkills : undefined },
    }

    expect(resolveSessionSkillView(ctx as never, '/workspace/fallback', 'session-1')).toEqual({
      skills: scopedSkills,
      cwd: '/workspace/current',
      scope: agent,
    })
  })

  it('falls back to the global Skill registry when a historical UI session is no longer live', () => {
    const globalSkills = { list: vi.fn(), get: vi.fn() }
    const ctx = {
      skills: globalSkills,
      sessions: { get: vi.fn(() => undefined) },
      agents: { get: vi.fn(() => undefined) },
      agentPresets: { serviceFor: vi.fn() },
    }

    expect(resolveSessionSkillView(ctx as never, '/workspace/fallback', 'detached-work-session')).toEqual({
      skills: globalSkills,
      cwd: '/workspace/fallback',
    })
  })
})

describe('Skill import orchestration', () => {
  it('re-normalizes with only the direct same-name conflict then installs the validated result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-skill-orchestrator-'))
    roots.push(root)
    const dshHome = join(root, 'home')
    const normalizations = vi.fn()
      .mockResolvedValueOnce({
        name: 'existing-skill', description: 'Imported',
        skillMarkdown: '---\nname: existing-skill\ndescription: Imported\n---\n\nImported.', resources: [],
      })
      .mockResolvedValueOnce({
        name: 'existing-skill', description: 'Adapted',
        skillMarkdown: '---\nname: existing-skill\ndescription: Adapted\n---\n\nAdapted.', resources: [],
      })
    const skills = {
      list: async () => [{ name: 'existing-skill', description: 'Existing', source: 'user-dsh', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } }],
      get: async (name: string) => name === 'existing-skill' ? {
        name, description: 'Existing', content: 'Keep this direct behavior.', source: 'user-dsh', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true },
      } : undefined,
    }
    const result = await importPersonalSkill({
      request: { kind: 'files', files: [{ path: 'notes.md', contentBase64: Buffer.from('# Import me').toString('base64') }] },
      dshHome,
      cwd: root,
      skills,
      normalize: normalizations,
    })
    expect(result).toEqual({ installed: 'existing-skill', replaced: false })
    expect(normalizations).toHaveBeenCalledTimes(2)
    expect(normalizations.mock.calls[0]?.[0].input).not.toContain('Keep this direct behavior.')
    expect(normalizations.mock.calls[1]?.[0].input).toContain('Keep this direct behavior.')
    expect(await readFile(join(dshHome, 'skills/existing-skill/SKILL.md'), 'utf8')).toContain('Adapted.')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { SkillManagerSection } from '../src/client/SkillManagerSection.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Skill settings registration', () => {
  it('registers the Skill management settings entry', () => {
    const entries: Array<{ options: Record<string, unknown>; component: unknown }> = []
    const slots = {
      register(options: Record<string, unknown>, component: unknown) {
        entries.push({ options, component })
        return () => {}
      },
      inject(_name: string, install: () => unknown) { install() },
    }
    apply({ slots } as never)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options).toMatchObject({ id: 'skill' })
    expect((entries[0]?.options.label as () => string)()).toBe('Skill 管理')
    expect(entries[0]?.component).toBe(SkillManagerSection)
    expect(inject).toEqual(['slots', 'sessions'])
  })

  it('keeps Skill management on the latest work session while plain chat is selected', async () => {
    let sectionInject: (() => { listSkills: () => Promise<unknown> }) | undefined
    const slots = {
      register(options: Record<string, unknown>) {
        sectionInject = options.inject as typeof sectionInject
        return () => {}
      },
      inject(_name: string, install: () => unknown) { install() },
    }
    const sessions = {
      list: {
        getSnapshot: () => ({
          current: 'chat-current',
          ids: ['chat-current', 'work-latest', 'work-older'],
          byId: {
            'chat-current': { id: 'chat-current', projectionValues: { agentPreset: 'chat' } },
            'work-latest': { id: 'work-latest', projectionValues: { agentPreset: 'code' } },
            'work-older': { id: 'work-older', projectionValues: { agentPreset: 'code' } },
          },
        }),
      },
    }
    const fetch = vi.fn(async () => new Response(JSON.stringify({ skills: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)

    apply({ slots, sessions } as never)
    await sectionInject!().listSkills()

    expect(fetch).toHaveBeenCalledWith(
      '/plugins/skill-manager/api/skills?sessionId=work-latest',
      { cache: 'no-store' },
    )
  })
})

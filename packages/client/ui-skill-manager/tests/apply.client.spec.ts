import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { SkillManagerSection } from '../src/client/SkillManagerSection.tsx'

describe('Skill settings registration', () => {
  it('registers one section whose entry and page title are both Skill', () => {
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
    expect((entries[0]?.options.label as () => string)()).toBe('Skill')
    expect(entries[0]?.component).toBe(SkillManagerSection)
    expect(inject).toEqual(['slots', 'sessions'])
  })
})

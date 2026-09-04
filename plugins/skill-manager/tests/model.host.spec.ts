import { describe, expect, it } from 'vitest'
import { generateNormalizedSkill, NORMALIZER_MODEL, NORMALIZER_PROVIDER } from '../src/model.ts'

describe('Skill normalizer model call', () => {
  it('uses the fixed vision model with an explicit empty tool list', async () => {
    const calls: unknown[] = []
    const output = JSON.stringify({
      name: 'safe-skill',
      description: 'Safe skill',
      category: '开发',
      skillMarkdown: '---\nname: safe-skill\ndescription: Safe skill\ncategory: 开发\n---\n\nUse it.',
      resources: [],
    })
    const ctx = {
      llm: {
        stream(options: unknown) {
          calls.push(options)
          return (async function* () {
            yield { type: 'text-delta' as const, index: 0, text: output }
            yield { type: 'finish' as const, reason: { kind: 'stop' as const } }
          })()
        },
      },
    }
    const normalized = await generateNormalizedSkill(ctx, { system: 'system', input: 'input' })
    expect(normalized.name).toBe('safe-skill')
    expect(NORMALIZER_PROVIDER).toBe('deepseek-official')
    expect(NORMALIZER_MODEL).toBe('deepseek-v4-flash-vision-exp')
    expect(calls[0]).toMatchObject({
      provider: NORMALIZER_PROVIDER,
      model: NORMALIZER_MODEL,
      system: 'system',
      tools: [],
      messages: [expect.objectContaining({ role: 'user' })],
    })
  })
})

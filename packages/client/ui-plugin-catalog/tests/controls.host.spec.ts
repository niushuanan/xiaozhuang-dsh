import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { PLUGIN_ROWS } from '../src/catalog.ts'
import { externalConfigFromSwitchBlock, replaceSwitchBlock, snapshot, statesFromSwitchBlock } from '../src/index.ts'

function loaderWith(overrides: Record<string, { disabled?: boolean; state?: number; fiber?: null }> = {}): Context['loader'] {
  const entries = Object.values(PLUGIN_ROWS).flat().map(id => ({
    options: { id },
    disabled: overrides[id]?.disabled ?? false,
    fiber: overrides[id]?.fiber === null ? undefined : { state: overrides[id]?.state ?? 2 },
  }))
  return { entries: () => entries } as unknown as Context['loader']
}

describe('native plugin catalog controls', () => {
  it('reports compound capability state from every mapped Loader row', () => {
    expect(snapshot(loaderWith()).plugins.find(plugin => (plugin as { id: string }).id === 'computer-use')).toMatchObject({ enabled: true, phase: 'active' })
    expect(snapshot(loaderWith({ 'ui-computer-use': { state: 1 } })).plugins.find(plugin => (plugin as { id: string }).id === 'computer-use')).toMatchObject({ enabled: false, phase: 'transitioning' })
  })

  it('keeps collaborator rows and persisted intent while replacing its bounded block', () => {
    const desired = Object.fromEntries(Object.keys(PLUGIN_ROWS).map(id => [id, true]))
    const source = replaceSwitchBlock('- insert:\n  - id: unrelated\n', desired, {
      codex: { model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' },
      zcode: { providerId: 'builtin:zai', modelId: 'GLM-5.3', reasoningEffort: 'max' },
    })
    expect(source).toContain('- id: subagent-codex-local\n  disabled: false')
    expect(source).toContain('- id: subagent-zcode-local\n  disabled: false')
    expect(source).toContain('- id: unrelated')
    expect(externalConfigFromSwitchBlock(source).codex.reasoningEffort).toBe('xhigh')
    expect(statesFromSwitchBlock(source, loaderWith({ 'team-work': { state: 1 } })).teamwork).toBe(true)
  })
})

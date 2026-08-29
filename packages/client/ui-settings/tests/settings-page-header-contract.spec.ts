import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SETTINGS_PAGES = [
  'packages/client/ui-adaptive-update/src/client/AdaptiveUpdateSection.tsx',
  'packages/client/ui-agent-preset/src/client/AgentPresetSection.tsx',
  'packages/client/ui-plugin-catalog/src/client/PluginCatalogSection.tsx',
  'packages/client/ui-product-companion/src/client/ProductCompanionSettings.tsx',
  'packages/client/ui-settings-models/src/client/ModelsSection.tsx',
  'packages/client/ui-settings-plugins/src/client/PluginsSettingsSection.tsx',
  'packages/client/ui-skill-manager/src/client/SkillManagerSection.tsx',
  'packages/memory/memory-system/src/client/MemorySettings.tsx',
  'packages/session-query/session-log-export/src/client/DeepSeekImportSection.tsx',
  'packages/workbench/better-sidebar/src/client/SideCardSection.tsx',
] as const

describe('top-level Settings page title contract', () => {
  it.each(SETTINGS_PAGES)('%s renders the shared header', (path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8')

    expect(source).toContain("from '@deepseek-ai/dsh-client-ui-primitives'")
    expect(source).toContain('<SettingsSectionHeader')
  })
})

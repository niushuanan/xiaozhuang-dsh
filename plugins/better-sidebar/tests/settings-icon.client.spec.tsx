// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { registerSettingsIcon } from '../src/client/settings-icon.ts'
import type { SidebarSlotsService } from '../src/context-types.ts'

it('registers the Side card icon against the real keyed settings declaration', async () => {
  const runtime = await SlotTestRuntime.create()
  try {
    runtime.slots.register({ name: 'root', children: {
      'settings.section.icon': { kind: 'keyed', scope: 'root' },
    } } as never, (() => null) as never)
    expect(() => registerSettingsIcon(runtime.slots as unknown as SidebarSlotsService)).not.toThrow()
    const entries = runtime.slots.entries('settings.section.icon')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options.key).toBe('better-sidebar')
  } finally { await runtime.dispose() }
})

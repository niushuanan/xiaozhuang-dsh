import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('web-app product composition', () => {
  it('does not ship the retired Computer Use runtime or client surface', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')

    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-computer-use')
    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-client-ui-computer-use')
    expect(patch).not.toContain('id: computer-use')
    expect(patch).not.toContain('id: ui-computer-use')
  })
})

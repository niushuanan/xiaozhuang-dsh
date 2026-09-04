// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  new URL('../src/client/SelectionReferenceDock.module.css', import.meta.url),
  'utf8',
)

describe('SelectionReferenceDock styles', () => {
  it('keeps the source preview inside the current composer and wraps long text', () => {
    expect(css).toMatch(/\.row\s*\{[^}]*position:\s*relative/s)
    expect(css).toMatch(/\.preview\s*\{[^}]*box-sizing:\s*border-box[^}]*max-width:\s*min\(520px,\s*100%\)/s)
    expect(css).toMatch(/\.preview\s*>\s*:last-child\s*\{[^}]*overflow-wrap:\s*anywhere/s)
  })
})

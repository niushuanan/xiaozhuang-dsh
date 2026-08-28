import { describe, expect, it } from 'vitest'
import { toggleRailPlacement } from '../src/client/layout-push.ts'

describe('workbench toggle rail placement', () => {
  it('falls back to the viewport right edge when the conversation anchor is unavailable', () => {
    expect(toggleRailPlacement(undefined, 38)).toEqual({ left: 'auto', right: '10px' })
  })

  it('docks just inside the conversation right edge when the anchor is available', () => {
    expect(toggleRailPlacement(1000, 38)).toEqual({ left: '956px', right: 'auto' })
  })
})

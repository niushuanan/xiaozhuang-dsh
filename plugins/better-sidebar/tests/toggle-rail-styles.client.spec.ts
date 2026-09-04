import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/sidebar.module.css', import.meta.url)), 'utf8')

function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('workbench toggle controls', () => {
  it('renders two separate floating controls instead of one heavy vertical capsule', () => {
    const rail = declarations('.toggleRail')
    const button = declarations('.toggleButton')

    expect(rail?.get('gap')).toBe('8px')
    expect(rail?.get('padding')).toBe('0')
    expect(rail?.get('border')).toBe('none')
    expect(rail?.get('background')).toBe('transparent')
    expect(button?.get('width')).toBe('32px')
    expect(button?.get('height')).toBe('32px')
    expect(button?.get('border')).toBe('1px solid var(--dsw-alias-border-l2)')
    expect(button?.get('border-radius')).toBe('10px')
    expect(button?.get('background')).toBe('var(--dsw-alias-bg-layer-2)')
  })
})

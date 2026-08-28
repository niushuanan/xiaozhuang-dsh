import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const layoutCss = readFileSync(fileURLToPath(new URL('../src/client/layout.css', import.meta.url)), 'utf8')
const panelCss = readFileSync(fileURLToPath(new URL('../src/client/sidebar.module.css', import.meta.url)), 'utf8')

function ruleBody(css: string, selector: string): string | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    return body.replace(/\s+/g, ' ').trim()
  }
  return undefined
}

describe('panel layout push performance contract', () => {
  it('commits host layout once instead of animating width and margins frame by frame', () => {
    const root = ruleBody(layoutCss, '#root')
    const conversation = ruleBody(layoutCss, '#root [data-dsh-frame] > [data-pane="conversation"]')

    expect(root).toBeDefined()
    expect(conversation).toBeDefined()
    expect(root).not.toMatch(/transition\s*:/)
    expect(conversation).not.toMatch(/transition\s*:/)
  })

  it('keeps collapsed panel subtrees style-ready while inert off screen', () => {
    const sideHidden = ruleBody(panelCss, '.panelHidden')
    const bottomHidden = ruleBody(panelCss, '.bottomPanelHidden')

    expect(sideHidden).toBeDefined()
    expect(bottomHidden).toBeDefined()
    expect(sideHidden).not.toMatch(/visibility\s*:/)
    expect(bottomHidden).not.toMatch(/visibility\s*:/)
  })
})

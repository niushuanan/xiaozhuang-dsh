// Web e2e: a multi-page conversation exposes every turn through one visible,
// clickable turn-navigation rail. The 88-turn seed exceeds both the 50-message
// history page and the old fixed-height dash column, so the scenario fails if
// paging stops after the tail page or if later marks are clipped.
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createChatScrollFixture } from './chat-scroll-fixture.ts'
import {
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const MODE = webSnapshotMode()
const OVERLAY = fileURLToPath(new URL('./conversation-outline.overlay.yml', import.meta.url))
const SEED_ID = 'conversation-outline-web-e2e'
const FIXTURE = createChatScrollFixture({
  markerPrefix: 'OUTLINE',
  title: 'CONVERSATION_OUTLINE full history',
  turns: 88,
})

async function openSeed(page: Page): Promise<void> {
  const searchButton = page.getByRole('button', { name: 'Search sessions' })
  if (await searchButton.getAttribute('aria-expanded') !== 'true') await searchButton.click()
  const search = page.getByRole('textbox', { name: 'Search sessions...', exact: true })
  await search.fill(FIXTURE.markers.user(1))
  const results = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
  await results.first().waitFor({ timeout: 60_000 })
  expect(await results.count()).toBe(1)
  await results.first().click()
  await page.getByText(FIXTURE.markers.assistant(FIXTURE.turns), { exact: false })
    .last().waitFor({ timeout: 30_000 })
}

describe('web e2e: complete conversation outline', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await seedSession(scaffold, FIXTURE.log, SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    try {
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    } catch {
      throw new Error(
        `conversation shell did not mount; warnings ${JSON.stringify(tripwire.warnings)}; `
        + `errors ${JSON.stringify(tripwire.pageErrors)}; `
        + `body ${(await page.locator('body').innerText()).slice(0, 1_000)}`,
      )
    }
    await openSeed(page)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.skipIf(MODE === 'record')('loads, fits, and jumps through all 88 turns', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-conversation-outline'))
    const rail = page.getByRole('navigation', { name: 'Turn navigation' })
    const dashes = rail.getByRole('button')
    try {
      await expect.poll(() => dashes.count(), { timeout: 60_000 }).toBe(FIXTURE.turns)
    } catch {
      throw new Error(
        `turn navigation stopped at ${String(await dashes.count())} turns; `
        + `warnings ${JSON.stringify(tripwire.warnings)}; errors ${JSON.stringify(tripwire.pageErrors)}`,
      )
    }
    const metrics = await rail.evaluate((element) => {
      const buttons = [...element.querySelectorAll<HTMLElement>('button')]
      const first = buttons[0]?.getBoundingClientRect()
      const last = buttons.at(-1)?.getBoundingClientRect()
      const bounds = element.getBoundingClientRect()
      return {
        count: buttons.length,
        firstTop: first?.top ?? Number.NaN,
        lastBottom: last?.bottom ?? Number.NaN,
        railTop: bounds.top,
        railBottom: bounds.bottom,
        railHeight: bounds.height,
      }
    })
    expect(metrics.count).toBe(FIXTURE.turns)
    expect(metrics.railHeight).toBeLessThan(FIXTURE.turns * 14)
    expect(metrics.firstTop).toBeGreaterThanOrEqual(metrics.railTop - 0.5)
    expect(metrics.lastBottom).toBeLessThanOrEqual(metrics.railBottom + 0.5)

    const conversation = page.locator('[data-pane="conversation"]')
    const conversationBounds = await conversation.boundingBox()
    const railBounds = await rail.boundingBox()
    if (conversationBounds === null || railBounds === null) {
      throw new Error('conversation or turn navigation has no browser geometry')
    }
    expect(railBounds.x + railBounds.width / 2)
      .toBeLessThan(conversationBounds.x + conversationBounds.width / 2)

    const firstMark = await dashes.first().boundingBox()
    if (firstMark === null) throw new Error('first turn mark has no browser geometry')
    await page.mouse.move(firstMark.x + firstMark.width / 2, firstMark.y + firstMark.height / 2)
    await page.getByRole('tooltip').waitFor()
    const previewBounds = await page.getByRole('tooltip').boundingBox()
    if (previewBounds === null) throw new Error('turn preview has no browser geometry')
    expect(previewBounds.x).toBeGreaterThanOrEqual(railBounds.x + railBounds.width)

    await page.mouse.click(firstMark.x + firstMark.width / 2, firstMark.y + firstMark.height / 2)
    await page.getByText(FIXTURE.markers.user(1), { exact: false }).last().waitFor({ state: 'visible' })
    const lastMark = await dashes.last().boundingBox()
    if (lastMark === null) throw new Error('last turn mark has no browser geometry')
    await page.mouse.click(lastMark.x + lastMark.width / 2, lastMark.y + lastMark.height / 2)
    await page.getByText(FIXTURE.markers.assistant(FIXTURE.turns), { exact: false }).last().waitFor({ state: 'visible' })
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)

  it.skipIf(MODE === 'record')('keeps the turn rail usable in an 824px narrow desktop window', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-conversation-outline-narrow'))
    await page.setViewportSize({ width: 824, height: 868 })

    const rail = page.getByRole('navigation', { name: 'Turn navigation' })
    await expect.poll(() => rail.isVisible()).toBe(true)
    await expect.poll(() => rail.getByRole('button').count()).toBe(FIXTURE.turns)

    const bounds = await rail.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeGreaterThan(0)
    expect(bounds!.height).toBeGreaterThan(0)
  })
})

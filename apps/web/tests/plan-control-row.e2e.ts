// Web e2e scenario: at the 800×720 viewport the plan status lives in the
// session header while the model trigger stays in the composer, and clicking
// the status leaves plan mode through the real command channel. The status
// moved out of the composer so session context no longer becomes another
// boxed input control.
//
// Plan mode is entered through the real /plan command with no argument:
// the command handler commits plan/mode active on the live agent without a
// model round (the lifecycle-chrome precedent), so the test needs no model
// call in any mode and no API key in replay/refresh; a providers-only
// fixture mounts the model catalog without a script to consume. Plan state
// folds from the session log (`plan/mode`, last one wins); the status executes
// /plan off through commands.execute, which needs the live agent
// connectFreshWorkspace keeps.
//
// The geometry golden records stable facts — viewport membership on both
// axes for the status and trigger, their vertical separation, and disjoint
// click areas — never
// absolute coordinates, whose pixel values depend on installed fonts and
// differ between macOS and Linux. The center hit-test is Playwright's
// actionability check: clicking the status fails in a real engine when the
// element center does not receive pointer events. jsdom resolves no layout,
// so only a real engine can answer any of these facts.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
// Type-only: pulls the plan/mode SessionEventMap merge so the discriminant
// filter below types as the plan-mode event in the host aggregate.
import type {} from '@deepseek-ai/dsh-plan-mode'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  assertFixtureInventory, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/plan-narrow-viewport', import.meta.url))
const FIXTURE = join(SNAPSHOT_DIR, 'session.jsonl')
const LAYOUT_EXPECTED = join(SNAPSHOT_DIR, 'layout.expected.md')
const MODE = webSnapshotMode()

/** The reported viewport: 800×720, where the composer card is 448px wide at 0.0.1. */
const VIEWPORT = { width: 800, height: 720 } as const

/** Status aria-label on the English page; it renders only while plan is the effective target. */
const STATUS_ARIA = 'Planning mode is on, press to turn it off'

describe('web e2e: plan status placement at the narrow viewport', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const sessionEvents: SessionEvent[] = []

  beforeAll(async () => {
    // replayProvidersOnly mounts the provider catalog without any recorded
    // script to consume (no model call happens — the /plan command never
    // steers a message), so the model trigger renders its real long label,
    // which is what made the reported overlap measurable.
    scaffold = await launchWebScaffold({ replayFixture: FIXTURE, replayProvidersOnly: true })
    scaffold.ctx.on('session/event', (_session, event: SessionEvent) => { sessionEvents.push(event) })
    browser = await chromium.launch()
    page = await newEnglishPage(browser, VIEWPORT.height)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    await page.setViewportSize(VIEWPORT)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('keeps the plan status above the composer and exits plan mode by click', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plan-narrow-viewport'))
    const input = page.locator('textarea').first()
    await input.waitFor({ timeout: 10_000 })
    await input.fill('/plan ')
    await input.press('Enter')

    // The command handler commits plan/mode active immediately (no model
    // round), so the session-header status and the composer model control —
    // the two surfaces under test — are both visible.
    const status = page.getByRole('button', { name: STATUS_ARIA })
    const trigger = page.getByRole('button', { name: /Select model/ })
    await status.waitFor({ timeout: 30_000 })
    await trigger.waitFor({ timeout: 10_000 })
    // The regression depends on the real model label width: a bare fallback
    // trigger would fit beside the old chip even on the pre-fix layout. The
    // directory loads asynchronously, so poll for the real label.
    await expect.poll(() => trigger.getAttribute('aria-label'), { timeout: 10_000 }).toContain('DeepSeek-V4-Flash')
    const statusBox = await status.boundingBox()
    const triggerBox = await trigger.boundingBox()
    expect(statusBox).not.toBeNull()
    expect(triggerBox).not.toBeNull()

    // The reported acceptance as numbers: both controls in viewport and
    // disjoint click areas (a non-zero overlap would fail), and — in the
    // click below — the status center receiving the pointer.
    const statusInViewport = statusBox!.x >= 0 && statusBox!.x + statusBox!.width <= VIEWPORT.width
      && statusBox!.y >= 0 && statusBox!.y + statusBox!.height <= VIEWPORT.height
    const triggerInViewport = triggerBox!.x >= 0 && triggerBox!.x + triggerBox!.width <= VIEWPORT.width
      && triggerBox!.y >= 0 && triggerBox!.y + triggerBox!.height <= VIEWPORT.height
    const statusAboveComposer = statusBox!.y + statusBox!.height <= triggerBox!.y
    const overlapLeft = Math.max(statusBox!.x, triggerBox!.x)
    const overlapTop = Math.max(statusBox!.y, triggerBox!.y)
    const overlapRight = Math.min(statusBox!.x + statusBox!.width, triggerBox!.x + triggerBox!.width)
    const overlapBottom = Math.min(statusBox!.y + statusBox!.height, triggerBox!.y + triggerBox!.height)
    const overlapArea = Math.max(0, overlapRight - overlapLeft) * Math.max(0, overlapBottom - overlapTop)

    const golden = [
      '# Planning status and model trigger at the 800×720 viewport',
      '',
      '- Planning status fully in viewport: ' + (statusInViewport ? 'true' : 'false'),
      '- Model trigger fully in viewport: ' + (triggerInViewport ? 'true' : 'false'),
      '- Planning status above composer: ' + (statusAboveComposer ? 'true' : 'false'),
      '- Click areas disjoint: ' + (overlapArea === 0 ? 'true' : 'false'),
    ].join('\n').trimEnd()
    await compareOrRefreshGolden(LAYOUT_EXPECTED, golden, MODE)
    expect(overlapArea).toBe(0)
    expect(statusInViewport).toBe(true)
    expect(statusAboveComposer).toBe(true)
    expect(triggerInViewport).toBe(true)

    // Exit through the real command channel: the click at the status's center
    // executes /plan off and the folded projection flips inactive, so the status
    // unmounts. Playwright's click() targets the element center by default and
    // its actionability check fails the click when that point is covered by
    // the model trigger — the reported bug as a failing click rather than a
    // coordinate probe.
    await status.click()
    await expect.poll(() => page.getByRole('button', { name: STATUS_ARIA }).count(), { timeout: 15_000 }).toBe(0)
    // The click must have committed the exit: the last plan/mode event flips
    // inactive (the /plan command's entry event stays active:true earlier in
    // the log, so the pair proves the exit and not just the entry).
    const planModes = sessionEvents.filter(
      (event): event is SessionEvent<'plan/mode'> => event.type === 'plan/mode',
    )
    expect(planModes.at(-1)?.data.active).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 200_000)

  it('keeps the snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.jsonl', 'layout.expected.md'])
  })
})

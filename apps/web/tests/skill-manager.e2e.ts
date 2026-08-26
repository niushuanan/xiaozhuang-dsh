// Web e2e scenario: the native Skill Management catalog, import menu, and
// focused file reader. The shipped Web composition reads one isolated
// personal Skill; no model call or import write is needed.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, connectFreshWorkspaceZh, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/skill-manager', import.meta.url))
const CATALOG_EXPECTED = join(SNAPSHOT_DIR, 'catalog.expected.md')
const GITHUB_EXPECTED = join(SNAPSHOT_DIR, 'github-import.expected.md')
const DETAIL_EXPECTED = join(SNAPSHOT_DIR, 'detail.expected.md')
const MODE = webSnapshotMode()

describe('web e2e: native Skill Management', () => {
  let harnessHome: string | undefined
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    harnessHome = await mkdtemp(join(tmpdir(), 'dsh-web-skill-manager-'))
    const skillRoot = join(harnessHome, 'skills', 'report-builder')
    await mkdir(join(skillRoot, 'references'), { recursive: true })
    await writeFile(join(skillRoot, 'SKILL.md'), [
      '---',
      'name: report-builder',
      'description: Turn source material into a concise report.',
      '---',
      '',
      '# Report Builder',
      '',
      'Use the checklist in `references/guide.md`.',
      '',
    ].join('\n'))
    await writeFile(join(skillRoot, 'references', 'guide.md'), '# Review checklist\n\nKeep conclusions traceable.\n')

    scaffold = await launchWebScaffold({ harnessHome })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1200, height: 900 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: 'Skill 管理', exact: true }).click()
    await dialog.getByRole('heading', { name: 'Skill 管理', exact: true }).waitFor({ timeout: 10_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    if (harnessHome !== undefined) await rm(harnessHome, { recursive: true, force: true })
  })

  it('keeps import choices together and gives files the detail workspace', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-skill-manager'))
    const section = page.getByRole('region', { name: 'Skill 管理' })
    await section.getByRole('button', { name: /report-builder/ }).waitFor({ timeout: 10_000 })

    const catalog = await captureStableAria(page, '[aria-label="Skill 管理"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(CATALOG_EXPECTED, catalog, MODE)

    await section.getByRole('button', { name: '导入 Skill', exact: true }).click()
    const menu = page.getByRole('menu')
    expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['导入文件', '导入文件夹', '从 GitHub 导入'])
    await menu.getByRole('menuitem', { name: '从 GitHub 导入' }).click()
    const githubInput = section.getByRole('textbox', { name: 'GitHub 仓库 URL' })
    await githubInput.waitFor()
    expect(await githubInput.evaluate(element => element === document.activeElement)).toBe(true)
    const github = await captureStableAria(page, '[aria-label="Skill 管理"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(GITHUB_EXPECTED, github, MODE)

    await section.getByRole('button', { name: /report-builder/ }).click()
    await section.getByRole('heading', { name: 'Report Builder' }).waitFor({ timeout: 10_000 })
    expect(await section.getByText('name: report-builder').count()).toBe(0)
    const tree = section.getByRole('tree', { name: 'report-builder 文件' })
    const preview = section.getByRole('article', { name: 'SKILL.md' })
    const [treeBox, previewBox] = await Promise.all([tree.boundingBox(), preview.boundingBox()])
    expect(treeBox).not.toBeNull()
    expect(previewBox).not.toBeNull()
    expect(previewBox!.width).toBeGreaterThan(treeBox!.width)
    expect(previewBox!.width).toBeGreaterThan(300)
    const detail = await captureStableAria(page, '[aria-label="Skill 管理"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DETAIL_EXPECTED, detail, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps its snapshot inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'catalog.expected.md',
      'detail.expected.md',
      'github-import.expected.md',
    ])
  })
})

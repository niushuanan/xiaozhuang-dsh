import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import type { BrowserBridge } from './bridge.ts'
import type {
  BrowserActionResult, BrowserMode, BrowserWorkspaceState, BrowserWorkspaceStep, BrowserWorkspaceTab,
} from './types.ts'

/** DOM projection shared conceptually with the extension: compact, ref-addressable, and model-readable. */
async function domSnapshot(page: Page): Promise<string> {
  return page.evaluate(() => {
    const selector = [
      'a[href]', 'button', 'input', 'textarea', 'select', '[role]',
      '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const elements = [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
      .slice(0, 250)
    const rows = elements.map((element, index) => {
      const ref = `e${index + 1}`
      element.dataset.dshRef = ref
      const role = element.getAttribute('role') || element.tagName.toLowerCase()
      const name = element.getAttribute('aria-label')
        || element.getAttribute('title')
        || ('value' in element && typeof element.value === 'string' ? element.value : '')
        || element.innerText
        || element.textContent
        || ''
      return `[${ref}] ${role} ${name.replace(/\s+/g, ' ').trim().slice(0, 180)}`.trim()
    })
    const heading = `${document.title || '新标签页'}\n${location.href}`
    return `${heading}\n${rows.join('\n')}`.slice(0, 30_000)
  })
}

interface SessionBrowser {
  context: BrowserContext
  page: Page
}

/** Clean, reproducible Playwright contexts owned per DSH session. */
export class IsolatedBrowserRuntime {
  private browser: Browser | undefined
  private readonly sessions = new Map<string, SessionBrowser>()
  private readonly pageIds = new WeakMap<Page, string>()

  /** Whether this platform can launch the configured system Chrome channel. */
  get available(): boolean {
    return process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux'
  }

  /**
   * Execute one action in a clean session-owned Playwright context.
   * @param action Stable browser action name.
   * @param sessionId DSH session that owns the isolated context.
   * @param args Action-specific arguments.
   * @param signal Cancellation signal inherited from tool execution.
   * @returns Compact DOM state and an optional page screenshot.
   */
  async act(action: string, sessionId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<BrowserActionResult> {
    if (signal.aborted) throw signal.reason
    if (action === 'close') {
      await this.close(sessionId)
      return { text: 'Isolated browser session closed.' }
    }
    const session = await this.session(sessionId)
    let page = session.page
    switch (action) {
      case 'open': {
        const url = requiredString(args, 'url')
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        break
      }
      case 'new_tab': {
        page = await session.context.newPage()
        session.page = page
        this.pageId(page)
        break
      }
      case 'snapshot': break
      case 'click': {
        await locator(page, args).click({ timeout: 15_000 })
        break
      }
      case 'fill': {
        await locator(page, args).fill(requiredString(args, 'text'), { timeout: 15_000 })
        break
      }
      case 'press_key': {
        await page.keyboard.press(requiredString(args, 'key'))
        break
      }
      case 'click_point': {
        const viewport = page.viewportSize()
        if (viewport === null) throw new Error('browser viewport is unavailable')
        await page.mouse.click(
          viewport.width * requiredRatio(args, 'xRatio'),
          viewport.height * requiredRatio(args, 'yRatio'),
        )
        break
      }
      case 'go_back': {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 })
        break
      }
      case 'go_forward': {
        await page.goForward({ waitUntil: 'domcontentloaded', timeout: 30_000 })
        break
      }
      case 'reload': {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
        break
      }
      case 'scroll': {
        const direction = optionalString(args, 'direction') ?? 'down'
        const amount = optionalNumber(args, 'amount') ?? 640
        await page.mouse.wheel(0, direction === 'up' ? -amount : amount)
        break
      }
      case 'tabs': {
        const tabs = await this.tabs(session)
        return {
          text: tabs.map((candidate, index) => `${candidate.active ? '*' : ' '} ${index + 1}. ${candidate.title} ${candidate.url}`).join('\n'),
          tabs,
        }
      }
      case 'use_tab': {
        const pages = session.context.pages()
        const tabId = optionalString(args, 'tabId')
        const index = optionalNumber(args, 'index') ?? 1
        const selected = tabId === undefined
          ? pages[index - 1]
          : pages.find(candidate => this.pageId(candidate) === tabId)
        if (selected === undefined) throw new Error(`browser tab ${tabId ?? String(index)} does not exist`)
        page = selected
        session.page = selected
        await page.bringToFront()
        break
      }
      case 'close_tab': {
        const pages = session.context.pages()
        if (pages.length <= 1) throw new Error('至少保留一个浏览器页面')
        const tabId = optionalString(args, 'tabId')
        const selected = tabId === undefined ? page : pages.find(candidate => this.pageId(candidate) === tabId)
        if (selected === undefined) throw new Error(`browser tab ${tabId ?? ''} does not exist`)
        const selectedIndex = pages.indexOf(selected)
        await selected.close()
        const remaining = session.context.pages()
        const nextPage = remaining[Math.min(selectedIndex, remaining.length - 1)]
        if (nextPage === undefined) throw new Error('浏览器页面已关闭')
        page = nextPage
        session.page = page
        await page.bringToFront()
        break
      }
      default: throw new Error(`unsupported isolated browser action: ${action}`)
    }
    await page.waitForTimeout(250)
    const [text, screenshot] = await Promise.all([
      domSnapshot(page),
      page.screenshot({ type: 'png', animations: 'disabled' }),
    ])
    return { text, screenshot: Buffer.from(screenshot), tabs: await this.tabs(session) }
  }

  /**
   * Close one isolated browser context.
   * @param sessionId DSH session whose context should be released.
   */
  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session === undefined) return
    this.sessions.delete(sessionId)
    await session.context.close()
  }

  /** Close every isolated context and the shared browser process. */
  async dispose(): Promise<void> {
    const contexts = [...this.sessions.values()].map(session => session.context.close())
    this.sessions.clear()
    await Promise.allSettled(contexts)
    await this.browser?.close()
    this.browser = undefined
  }

  private async session(sessionId: string): Promise<SessionBrowser> {
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined) return existing
    this.browser ??= await chromium.launch({ channel: 'chrome', headless: true })
    const context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    this.pageId(page)
    const created = { context, page }
    this.sessions.set(sessionId, created)
    return created
  }

  private pageId(page: Page): string {
    const existing = this.pageIds.get(page)
    if (existing !== undefined) return existing
    const created = crypto.randomUUID()
    this.pageIds.set(page, created)
    return created
  }

  private async tabs(session: SessionBrowser): Promise<BrowserWorkspaceTab[]> {
    const pages = session.context.pages()
    return Promise.all(pages.map(async page => ({
      id: this.pageId(page),
      title: await page.title().catch(() => '') || (page.url() === 'about:blank' ? '新标签页' : '网页'),
      url: page.url(),
      active: page === session.page,
      closable: pages.length > 1,
    })))
  }
}

/** Route browser actions to the clean Playwright provider or paired Chrome extension. */
export class BrowserRuntime {
  private readonly connectedSessions = new Set<string>()
  private readonly workspaces = new Map<string, MutableBrowserWorkspace>()

  constructor(
    readonly isolated: IsolatedBrowserRuntime,
    private readonly bridge: BrowserBridge,
    private readonly connectedNewTab: () => boolean,
  ) {}

  /**
   * Dispatch one action to the isolated or authorized-Chrome provider.
   * @param mode Browser provider selected for the current slash command.
   * @param action Stable browser action name.
   * @param sessionId DSH session that owns this browser task.
   * @param args Action-specific arguments.
   * @param signal Cancellation signal inherited from tool execution.
   * @returns Provider state after the action.
   */
  async act(
    mode: BrowserMode,
    action: string,
    sessionId: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<BrowserActionResult> {
    if (this.workspaces.get(sessionId)?.paused === true) {
      throw new Error('浏览器工作区已暂停，请先继续后再执行。')
    }
    return this.execute(mode, action, sessionId, args, signal)
  }

  /** User-driven controls from the loopback conversation workspace. */
  async control(
    mode: BrowserMode,
    action: string,
    sessionId: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<BrowserWorkspaceState> {
    if (action === 'pause') {
      this.workspace(sessionId, mode).paused = true
      return this.requiredWorkspaceState(sessionId)
    }
    if (action === 'resume') {
      this.workspace(sessionId, mode).paused = false
      return this.requiredWorkspaceState(sessionId)
    }
    if (!WORKSPACE_ACTIONS.has(action)) throw new Error(`unsupported browser workspace action: ${action}`)
    await this.execute(mode, action, sessionId, args, signal)
    return this.requiredWorkspaceState(sessionId)
  }

  /** Serializable live state for one session's side workspace. */
  workspaceState(sessionId: string): BrowserWorkspaceState | undefined {
    const state = this.workspaces.get(sessionId)
    if (state === undefined) return undefined
    return {
      sessionId,
      mode: state.mode,
      active: state.active,
      paused: state.paused,
      running: state.running,
      ...state.action === undefined ? {} : { action: state.action },
      ...state.title === undefined ? {} : { title: state.title },
      ...state.url === undefined ? {} : { url: state.url },
      text: state.text,
      hasScreenshot: state.screenshot !== undefined,
      screenshotVersion: state.screenshotVersion,
      updatedAt: state.updatedAt,
      tabs: state.tabs.map(tab => ({ ...tab })),
      steps: state.steps.map(step => ({ ...step })),
    }
  }

  private requiredWorkspaceState(sessionId: string): BrowserWorkspaceState {
    const state = this.workspaceState(sessionId)
    if (state === undefined) throw new Error('浏览器工作区尚未创建')
    return state
  }

  /** Last visible-page screenshot for one session. */
  workspaceScreenshot(sessionId: string): Buffer | undefined {
    return this.workspaces.get(sessionId)?.screenshot
  }

  /**
   * Release both provider surfaces associated with one disposed DSH session.
   * @param sessionId DSH session whose contexts and task-owned tabs should close.
   */
  async closeSession(sessionId: string): Promise<void> {
    await this.isolated.close(sessionId)
    if (this.connectedSessions.delete(sessionId)) {
      await this.bridge.request('close', sessionId, {}, AbortSignal.timeout(5_000)).catch(() => {})
    }
    this.workspaces.delete(sessionId)
  }

  /** Release every session-owned provider surface. */
  async dispose(): Promise<void> {
    const connected = [...this.connectedSessions]
    this.connectedSessions.clear()
    await Promise.allSettled(connected.map(sessionId => (
      this.bridge.request('close', sessionId, {}, AbortSignal.timeout(5_000))
    )))
    await this.isolated.dispose()
    this.workspaces.clear()
  }

  private async execute(
    mode: BrowserMode,
    action: string,
    sessionId: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<BrowserActionResult> {
    const state = this.workspace(sessionId, mode)
    const previousMode = state.mode
    state.active = action !== 'close'
    state.mode = mode
    state.running = true
    state.action = action
    state.updatedAt = Date.now()
    const step: BrowserWorkspaceStep = {
      id: crypto.randomUUID(),
      action,
      detail: actionDetail(action, args),
      status: 'running',
      startedAt: state.updatedAt,
    }
    state.steps = [...state.steps.slice(-11), step]
    try {
      const result = mode === 'isolated'
        ? await this.isolated.act(action, sessionId, args, signal)
        : await this.connectedAction(action, sessionId, args, signal)
      state.running = false
      delete state.action
      state.text = result.text
      state.updatedAt = Date.now()
      step.status = 'complete'
      step.finishedAt = state.updatedAt
      const [title, url] = result.text.split('\n', 2)
      if (title !== undefined && title.trim() !== '') state.title = title.trim()
      if (url !== undefined && url.trim() !== '') state.url = url.trim()
      if (result.screenshot !== undefined) {
        state.screenshot = result.screenshot
        state.screenshotVersion += 1
      }
      if (result.tabs !== undefined) state.tabs = result.tabs.map(tab => ({ ...tab }))
      else if (previousMode !== mode) state.tabs = []
      if (action === 'new_tab' && result.screenshot === undefined) {
        delete state.screenshot
        state.screenshotVersion += 1
      }
      if (action === 'close') {
        state.active = false
        delete state.screenshot
        state.screenshotVersion += 1
      }
      return result
    } catch (error) {
      state.running = false
      delete state.action
      state.updatedAt = Date.now()
      step.status = 'error'
      step.finishedAt = state.updatedAt
      throw error
    }
  }

  private async connectedAction(
    action: string,
    sessionId: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<BrowserActionResult> {
    this.connectedSessions.add(sessionId)
    const result = await this.bridge.request(action, sessionId, action === 'open'
      ? { ...args, newTab: this.connectedNewTab() }
      : args, signal)
    if (action === 'close') this.connectedSessions.delete(sessionId)
    return result
  }

  private workspace(sessionId: string, mode: BrowserMode): MutableBrowserWorkspace {
    const existing = this.workspaces.get(sessionId)
    if (existing !== undefined) return existing
    const created: MutableBrowserWorkspace = {
      mode,
      active: false,
      paused: false,
      running: false,
      text: '',
      screenshotVersion: 0,
      updatedAt: Date.now(),
      tabs: [],
      steps: [],
    }
    this.workspaces.set(sessionId, created)
    return created
  }
}

interface MutableBrowserWorkspace {
  mode: BrowserMode
  active: boolean
  paused: boolean
  running: boolean
  action?: string
  title?: string
  url?: string
  text: string
  screenshot?: Buffer
  screenshotVersion: number
  updatedAt: number
  tabs: BrowserWorkspaceTab[]
  steps: BrowserWorkspaceStep[]
}

const WORKSPACE_ACTIONS = new Set([
  'open', 'new_tab', 'snapshot', 'click_point', 'go_back', 'go_forward', 'reload',
  'use_tab', 'close_tab', 'close',
])

function actionDetail(action: string, args: Record<string, unknown>): string {
  if (action === 'open') return optionalString(args, 'url') ?? '打开网页'
  if (action === 'new_tab') return '新建页面'
  if (action === 'use_tab') return '切换页面'
  if (action === 'close_tab') return '关闭页面'
  if (action === 'click_point') return '点击页面'
  if (action === 'go_back') return '返回上一页'
  if (action === 'go_forward') return '前往下一页'
  if (action === 'reload' || action === 'snapshot') return '刷新页面状态'
  if (action === 'close') return '关闭浏览器会话'
  return action
}

function locator(page: Page, args: Record<string, unknown>) {
  const ref = optionalString(args, 'ref')
  if (ref !== undefined) return page.locator(`[data-dsh-ref="${ref.replace(/"/g, '\\"')}"]`).first()
  const selector = requiredString(args, 'selector')
  return page.locator(selector).first()
}

function requiredString(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string`)
  return value
}

function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function optionalNumber(args: Record<string, unknown>, name: string): number | undefined {
  const value = args[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function requiredRatio(args: Record<string, unknown>, name: string): number {
  const value = optionalNumber(args, name)
  if (value === undefined || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`)
  return value
}

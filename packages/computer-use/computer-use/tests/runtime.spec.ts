import { afterEach, describe, expect, it } from 'vitest'
import type { BrowserBridge } from '../src/bridge.ts'
import { BrowserRuntime, IsolatedBrowserRuntime } from '../src/browsers.ts'
import { DesktopPermissionCache } from '../src/desktop.ts'
import { parseBrowserCommand } from '../src/index.ts'

describe('Computer Use runtime', () => {
  let browser: IsolatedBrowserRuntime | undefined

  afterEach(async () => { await browser?.dispose() })

  it('shares one native permission probe until permission setup explicitly invalidates it', async () => {
    let release: ((value: {
      installed: boolean
      accessibility: 'granted'
      screenRecording: 'granted'
    }) => void) | undefined
    let reads = 0
    const cache = new DesktopPermissionCache(
      () => {
        reads += 1
        return new Promise((resolve) => { release = resolve })
      },
    )

    const first = cache.read()
    const concurrent = cache.read()
    release?.({ installed: true, accessibility: 'granted', screenRecording: 'granted' })
    expect(await Promise.all([first, concurrent])).toHaveLength(2)
    expect(reads).toBe(1)

    await cache.read()
    expect(reads).toBe(1)
    await cache.read()
    expect(reads).toBe(1)

    cache.invalidate()
    const refreshed = cache.read()
    release?.({ installed: true, accessibility: 'granted', screenRecording: 'granted' })
    await refreshed
    expect(reads).toBe(2)
  })

  it('parses explicit browser modes without consuming ordinary task text', () => {
    expect(parseBrowserCommand(' isolated open example.com ', 'connected'))
      .toEqual({ mode: 'isolated', task: 'open example.com' })
    expect(parseBrowserCommand('real use my signed-in account', 'isolated'))
      .toEqual({ mode: 'connected', task: 'use my signed-in account' })
    expect(parseBrowserCommand('find the docs', 'isolated'))
      .toEqual({ mode: 'isolated', task: 'find the docs' })
  })

  it('drives a clean real Chrome context and returns refs plus screenshots', async () => {
    browser = new IsolatedBrowserRuntime()
    const signal = new AbortController().signal
    const opened = await browser.act('open', 'session-a', {
      url: 'data:text/html,<title>DSH Browser Test</title><button onclick="this.textContent=\'done\'">run</button>',
    }, signal)
    expect(opened.text).toContain('DSH Browser Test')
    expect(opened.text).toContain('[e1] button run')
    expect(opened.screenshot?.byteLength).toBeGreaterThan(100)

    const clicked = await browser.act('click', 'session-a', { ref: 'e1' }, signal)
    expect(clicked.text).toContain('[e1] button done')
  }, 30_000)

  it('captures the current browser selection with its source element and nearby context', async () => {
    browser = new IsolatedBrowserRuntime()
    const signal = new AbortController().signal
    await browser.act('open', 'session-selection', {
      url: `data:text/html,${encodeURIComponent(`
        <title>Selection source</title>
        <main><h2>Memory design</h2><p id="answer">Before <strong>selected answer</strong> after</p></main>
        <script>
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('strong'));
          getSelection().removeAllRanges();
          getSelection().addRange(range);
        </script>
      `)}`,
    }, signal)

    const captured = await browser.act('selection', 'session-selection', {}, signal)
    const packet = JSON.parse(captured.text)
    expect(packet).toMatchObject({
      kind: 'browser-selection',
      selectedText: 'selected answer',
      page: { title: 'Selection source' },
      element: {
        tagName: 'strong',
        selector: 'main > p#answer > strong',
      },
      context: {
        heading: 'Memory design',
        before: expect.stringContaining('Before'),
        after: expect.stringContaining('after'),
      },
    })
    expect(packet.element.outerHTML).toBe('<strong>selected answer</strong>')
  }, 30_000)

  it('releases only the connected-browser session when its DSH session ends', async () => {
    const calls: Array<{ action: string; sessionId: string }> = []
    const bridge = {
      request: async (action: string, sessionId: string) => {
        calls.push({ action, sessionId })
        return { text: 'ok' }
      },
    } as unknown as BrowserBridge
    browser = new IsolatedBrowserRuntime()
    const runtime = new BrowserRuntime(browser, bridge, () => true)
    await runtime.act('connected', 'snapshot', 'session-real', {}, new AbortController().signal)
    await runtime.closeSession('session-real')
    expect(calls).toEqual([
      { action: 'snapshot', sessionId: 'session-real' },
      { action: 'close', sessionId: 'session-real' },
    ])
  })

  it('keeps a live workspace state and accepts normalized user clicks', async () => {
    browser = new IsolatedBrowserRuntime()
    const bridge = { request: async () => ({ text: 'unused' }) } as unknown as BrowserBridge
    const runtime = new BrowserRuntime(browser, bridge, () => true)
    const signal = new AbortController().signal
    await runtime.control('isolated', 'open', 'session-workspace', {
      url: 'data:text/html,<title>Workspace</title><button style="position:fixed;inset:0;width:160px;height:120px" onclick="document.title=\'Clicked\'">run</button>',
    }, signal)
    await runtime.control('isolated', 'click_point', 'session-workspace', {
      xRatio: 0.04,
      yRatio: 0.04,
    }, signal)

    const state = runtime.workspaceState('session-workspace')
    expect(state).toMatchObject({ active: true, running: false, title: 'Clicked', hasScreenshot: true })
    expect(state?.steps.map(step => step.action)).toEqual(['open', 'click_point'])
  }, 30_000)

  it('keeps multiple isolated pages and switches them without losing either page', async () => {
    browser = new IsolatedBrowserRuntime()
    const bridge = { request: async () => ({ text: 'unused' }) } as unknown as BrowserBridge
    const runtime = new BrowserRuntime(browser, bridge, () => true)
    const signal = new AbortController().signal
    let state = await runtime.control('isolated', 'open', 'session-tabs', {
      url: 'data:text/html,<title>First page</title><p>one</p>',
    }, signal)
    const firstId = state.tabs[0]?.id
    expect(state.tabs).toMatchObject([{ title: 'First page', active: true }])

    state = await runtime.control('isolated', 'new_tab', 'session-tabs', {}, signal)
    expect(state.tabs).toHaveLength(2)
    const secondId = state.tabs.find(tab => tab.active)?.id
    state = await runtime.control('isolated', 'open', 'session-tabs', {
      url: 'data:text/html,<title>Second page</title><p>two</p>',
    }, signal)
    expect(state.tabs.map(tab => tab.title)).toEqual(['First page', 'Second page'])

    state = await runtime.control('isolated', 'use_tab', 'session-tabs', { tabId: firstId }, signal)
    expect(state).toMatchObject({ title: 'First page', url: expect.stringContaining('data:text/html') })
    expect(state.tabs.find(tab => tab.active)?.id).toBe(firstId)

    state = await runtime.control('isolated', 'close_tab', 'session-tabs', { tabId: secondId }, signal)
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]).toMatchObject({ id: firstId, title: 'First page', active: true, closable: false })
  }, 30_000)
})

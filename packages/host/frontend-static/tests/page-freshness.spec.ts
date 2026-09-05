/** Execute the emitted recovery script without loading the application bundle. */
import { JSDOM } from 'jsdom'
import { afterEach, expect, it, vi } from 'vitest'
import { pageFreshnessScript } from '../src/page-freshness.ts'

let dom: JSDOM | undefined
afterEach(() => { dom?.window.close(); dom = undefined })

function boot(response: Response) {
  dom = new JSDOM('<body><textarea>unsent draft</textarea><p>Existing conversation</p></body>', {
    url: 'http://localhost:3080/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const fetch = vi.fn().mockResolvedValue(response)
  Object.assign(dom.window, { fetch, AbortSignal })
  dom.window.eval(pageFreshnessScript(100, 30_000))
  dom.window.dispatchEvent(new dom.window.Event('focus'))
  return { window: dom.window, fetch }
}

it('offers one reload action after restart and preserves the open conversation and draft', async () => {
  const { window, fetch } = boot(Response.json({ startedAt: 200 }))
  await vi.waitFor(() => { expect(window.document.querySelector('[role="alert"]')).not.toBeNull() })
  expect(window.document.querySelector('[role="alert"]')?.textContent).toContain('Reload this page to view complete conversations')
  expect(window.document.querySelector('textarea')?.value).toBe('unsent draft')
  expect(window.document.querySelector('p')?.textContent).toBe('Existing conversation')
  expect(window.document.querySelectorAll('#dsh-page-recovery')).toHaveLength(1)
  expect(window.document.querySelector('#dsh-page-recovery button')?.textContent).toBe('Reload and reconnect')
  expect(fetch).toHaveBeenCalledWith('/__dsh/runtime', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }))
})

it('explains expired login instead of silently treating partial history as complete', async () => {
  const { window } = boot(new Response('', { status: 401 }))
  await vi.waitFor(() => { expect(window.document.querySelector('[role="alert"]')).not.toBeNull() })
  expect(window.document.querySelector('[role="alert"]')?.textContent).toContain('needs to sign in again')
})

it('leaves a current page alone', async () => {
  const response = Response.json({ startedAt: 100 })
  const { window } = boot(response)
  await vi.waitFor(() => { expect(response.bodyUsed).toBe(true) })
  expect(window.document.querySelector('[role="alert"]')).toBeNull()
  expect(window.document.querySelector('textarea')?.value).toBe('unsent draft')
})

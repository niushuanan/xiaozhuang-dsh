let socket
let connected = false
let heartbeat
const sessionTabs = new Map()
const MAX_SCREENSHOT_SIDE = 1600

function sessionState(sessionId) {
  const existing = sessionTabs.get(sessionId)
  if (existing) return existing
  const created = { controlled: [], owned: [], active: undefined }
  sessionTabs.set(sessionId, created)
  return created
}

function parsePairing(value) {
  const hash = value.lastIndexOf('#')
  if (hash === -1) throw new Error('pairing token is missing')
  return { url: value.slice(0, hash), token: value.slice(hash + 1) }
}

function connectBridge(value) {
  const { url, token } = parsePairing(value)
  socket?.close()
  socket = new WebSocket(url)
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({
      type: 'hello', token, version: chrome.runtime.getManifest().version,
      browser: navigator.userAgent,
    }))
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.type === 'hello-accepted') {
      connected = true
      clearInterval(heartbeat)
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' }))
      }, 20_000)
      return
    }
    if (message.type === 'request') void handleRequest(message)
  })
  socket.addEventListener('close', () => {
    connected = false
    clearInterval(heartbeat)
    setTimeout(() => {
      chrome.storage.local.get(['dshPairing'], ({ dshPairing }) => {
        if (typeof dshPairing === 'string') connectBridge(dshPairing)
      })
    }, 1500)
  })
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type === 'status') reply({ connected })
  if (message.type === 'connect') {
    try { connectBridge(message.value); reply({ ok: true }) }
    catch (error) { reply({ ok: false, error: String(error) }) }
  }
  return true
})

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['dshPairing'], ({ dshPairing }) => {
    if (typeof dshPairing === 'string') connectBridge(dshPairing)
  })
})

chrome.storage.local.get(['dshPairing'], ({ dshPairing }) => {
  if (typeof dshPairing === 'string') connectBridge(dshPairing)
})

async function activeTab(sessionId, args = {}) {
  const state = sessionState(sessionId)
  const selected = state.active || state.controlled.at(-1)
  if (selected !== undefined) {
    try { return await chrome.tabs.get(selected) } catch { /* tab was closed by user */ }
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!active?.id) throw new Error('No active Chrome tab is available')
  if (!state.controlled.includes(active.id)) state.controlled.push(active.id)
  state.active = active.id
  return active
}

async function openTab(sessionId, args) {
  const state = sessionState(sessionId)
  let tab
  if (args.newTab !== false) {
    tab = await chrome.tabs.create({ url: args.url, active: true })
    if (tab.id && !state.owned.includes(tab.id)) state.owned.push(tab.id)
  }
  else {
    tab = await activeTab(sessionId)
    tab = await chrome.tabs.update(tab.id, { url: args.url, active: true })
  }
  if (!tab.id) throw new Error('Chrome did not create a tab')
  if (!state.controlled.includes(tab.id)) state.controlled.push(tab.id)
  state.active = tab.id
  await waitForLoad(tab.id)
  return tab
}

async function tabsForSession(sessionId) {
  const state = sessionState(sessionId)
  const tabs = await Promise.all(state.controlled.map(id => chrome.tabs.get(id).catch(() => null)))
  const live = tabs.filter(Boolean)
  const liveIds = live.map(tab => tab.id)
  state.controlled = state.controlled.filter(id => liveIds.includes(id))
  state.owned = state.owned.filter(id => liveIds.includes(id))
  if (!liveIds.includes(state.active)) state.active = liveIds.at(-1)
  return live.map(tab => ({
    id: String(tab.id),
    title: tab.title || (tab.url === 'about:blank' ? '新标签页' : '网页'),
    url: tab.url || '',
    active: tab.id === state.active,
    closable: live.length > 1 && state.owned.includes(tab.id),
  }))
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve() }, 12_000)
    function listener(id, info) {
      if (id !== tabId || info.status !== 'complete') return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

async function execute(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args })
  return result?.result
}

function snapshotPage() {
  const selector = 'a[href],button,input,textarea,select,[role],[contenteditable="true"],[tabindex]:not([tabindex="-1"])'
  const elements = [...document.querySelectorAll(selector)].filter((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }).slice(0, 250)
  const rows = elements.map((element, index) => {
    const ref = `e${index + 1}`
    element.dataset.dshRef = ref
    const role = element.getAttribute('role') || element.tagName.toLowerCase()
    const value = 'value' in element && typeof element.value === 'string' ? element.value : ''
    const name = element.getAttribute('aria-label') || element.getAttribute('title') || value || element.innerText || element.textContent || ''
    return `[${ref}] ${role} ${name.replace(/\s+/g, ' ').trim().slice(0, 180)}`.trim()
  })
  return `${document.title}\n${location.href}\n${rows.join('\n')}`.slice(0, 30000)
}

function clickPage(ref, selector) {
  const element = ref ? document.querySelector(`[data-dsh-ref="${CSS.escape(ref)}"]`) : document.querySelector(selector)
  if (!element) throw new Error(`Element ${ref || selector} was not found`)
  element.scrollIntoView({ block: 'center', inline: 'center' })
  element.click()
}

function fillPage(ref, selector, text) {
  const element = ref ? document.querySelector(`[data-dsh-ref="${CSS.escape(ref)}"]`) : document.querySelector(selector)
  if (!element) throw new Error(`Element ${ref || selector} was not found`)
  element.focus()
  if ('value' in element) element.value = text
  else if (element.isContentEditable) element.textContent = text
  else throw new Error('Target element is not editable')
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function pressPage(key) {
  const target = document.activeElement || document.body
  for (const type of ['keydown', 'keypress', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
  if (key === 'Enter' && target instanceof HTMLElement) target.click()
}

function scrollPage(direction, amount) {
  window.scrollBy({ top: direction === 'up' ? -amount : amount, behavior: 'instant' })
}

function clickPointPage(xRatio, yRatio) {
  const x = Math.max(0, Math.min(window.innerWidth - 1, window.innerWidth * xRatio))
  const y = Math.max(0, Math.min(window.innerHeight - 1, window.innerHeight * yRatio))
  const element = document.elementFromPoint(x, y)
  if (!(element instanceof HTMLElement)) throw new Error('No clickable element exists at that point')
  element.scrollIntoView({ block: 'center', inline: 'center' })
  element.click()
}

async function captureScreenshot(tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  const sourceBlob = await fetch(dataUrl).then(response => response.blob())
  const source = await createImageBitmap(sourceBlob)
  try {
    if (Math.max(source.width, source.height) <= MAX_SCREENSHOT_SIDE) {
      return dataUrl.slice(dataUrl.indexOf(',') + 1)
    }
    const scale = MAX_SCREENSHOT_SIDE / Math.max(source.width, source.height)
    const width = Math.max(1, Math.round(source.width * scale))
    const height = Math.max(1, Math.round(source.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Chrome could not create a screenshot canvas')
    context.drawImage(source, 0, 0, width, height)
    return blobToBase64(await canvas.convertToBlob({ type: 'image/png' }))
  } finally {
    source.close()
  }
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

async function stateFor(sessionId, tab) {
  const text = await execute(tab.id, snapshotPage).catch(() => `${tab.title || '新标签页'}\n${tab.url || 'about:blank'}`)
  const tabs = await tabsForSession(sessionId)
  try {
    return { text, screenshot: await captureScreenshot(tab), tabs }
  } catch {
    return { text, tabs }
  }
}

async function handleRequest(message) {
  try {
    const { action, sessionId, args } = message
    if (action === 'close') {
      const ids = sessionTabs.get(sessionId)?.owned || []
      sessionTabs.delete(sessionId)
      if (ids.length > 0) await chrome.tabs.remove(ids)
      return sendResult(message.requestId, { text: 'Connected browser session tabs closed.' })
    }
    if (action === 'tabs') {
      const tabs = await tabsForSession(sessionId)
      return sendResult(message.requestId, { text: tabs.map((tab, i) => `${i + 1}. ${tab.title} ${tab.url}`).join('\n'), tabs })
    }
    if (action === 'use_tab') {
      const state = sessionState(sessionId)
      const id = args.tabId === undefined
        ? state.controlled[(args.index || 1) - 1]
        : state.controlled.find(candidate => String(candidate) === String(args.tabId))
      if (!id) throw new Error(`Browser tab ${args.tabId || args.index} does not exist`)
      state.active = id
      await chrome.tabs.update(id, { active: true })
      const tab = await chrome.tabs.get(id)
      return sendResult(message.requestId, await stateFor(sessionId, tab))
    }
    if (action === 'new_tab') {
      const state = sessionState(sessionId)
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true })
      if (!tab.id) throw new Error('Chrome did not create a tab')
      state.controlled.push(tab.id)
      state.owned.push(tab.id)
      state.active = tab.id
      return sendResult(message.requestId, await stateFor(sessionId, tab))
    }
    if (action === 'close_tab') {
      const state = sessionState(sessionId)
      const id = state.controlled.find(candidate => String(candidate) === String(args.tabId || state.active))
      if (!id) throw new Error(`Browser tab ${args.tabId || ''} does not exist`)
      if (!state.owned.includes(id)) throw new Error('只能关闭由 Computer Use 新建的页面')
      if (state.controlled.length <= 1) throw new Error('至少保留一个浏览器页面')
      await chrome.tabs.remove(id)
      state.controlled = state.controlled.filter(candidate => candidate !== id)
      state.owned = state.owned.filter(candidate => candidate !== id)
      state.active = state.controlled.at(-1)
      const tab = await chrome.tabs.get(state.active)
      await chrome.tabs.update(tab.id, { active: true })
      return sendResult(message.requestId, await stateFor(sessionId, tab))
    }
    const tab = action === 'open' ? await openTab(sessionId, args) : await activeTab(sessionId, args)
    sessionState(sessionId).active = tab.id
    if (action === 'go_back') await chrome.tabs.goBack(tab.id)
    if (action === 'go_forward') await chrome.tabs.goForward(tab.id)
    if (action === 'reload') await chrome.tabs.reload(tab.id)
    if (action === 'click') await execute(tab.id, clickPage, [args.ref, args.selector])
    if (action === 'click_point') await execute(tab.id, clickPointPage, [args.xRatio, args.yRatio])
    if (action === 'fill') await execute(tab.id, fillPage, [args.ref, args.selector, args.text])
    if (action === 'press_key') await execute(tab.id, pressPage, [args.key])
    if (action === 'scroll') await execute(tab.id, scrollPage, [args.direction || 'down', args.amount || 640])
    if (['go_back', 'go_forward', 'reload'].includes(action)) await waitForLoad(tab.id)
    else if (action !== 'snapshot') await new Promise(resolve => setTimeout(resolve, 250))
    sendResult(message.requestId, await stateFor(sessionId, await chrome.tabs.get(tab.id)))
  } catch (error) {
    socket?.send(JSON.stringify({ type: 'result', requestId: message.requestId, ok: false, error: error instanceof Error ? error.message : String(error) }))
  }
}

function sendResult(requestId, result) {
  socket?.send(JSON.stringify({ type: 'result', requestId, ok: true, result }))
}

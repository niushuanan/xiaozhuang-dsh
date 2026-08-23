const pairing = document.querySelector('#pairing')
const status = document.querySelector('#status')
const connect = document.querySelector('#connect')

chrome.storage.local.get(['dshPairing'], ({ dshPairing }) => {
  if (typeof dshPairing === 'string') pairing.value = dshPairing
})

function refresh() {
  chrome.runtime.sendMessage({ type: 'status' }, (reply) => {
    const connected = reply?.connected === true
    status.textContent = connected ? '已连接到 DeepSeek Harness' : '尚未连接'
    status.dataset.connected = String(connected)
  })
}

connect.addEventListener('click', () => {
  const value = pairing.value.trim()
  if (!value.startsWith('ws://127.0.0.1:')) {
    status.textContent = '连接信息格式不正确'
    return
  }
  chrome.storage.local.set({ dshPairing: value }, () => {
    chrome.runtime.sendMessage({ type: 'connect', value }, () => setTimeout(refresh, 300))
  })
})

refresh()

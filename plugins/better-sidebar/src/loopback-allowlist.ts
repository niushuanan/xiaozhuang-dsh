/**
 * The browser tab's `browserAllowedLoopback` allowlist matcher, shared by the
 * host routes that must apply the same loopback gate as the client address
 * bar (`browser.probe` and the `sidebar_open` tool). Bare hosts
 * (`localhost`, `127.0.0.1`) match every port; `host:port` entries match
 * exactly that authority. Entries are case-insensitive.
 */

/** Parse the loopback allowlist into a matcher predicate over host:port. */
export function parseLoopbackAllowlist(allowlist: string): (host: string, port: string) => boolean {
  const entries = allowlist.split(',').map(entry => entry.trim().toLowerCase()).filter(entry => entry !== '')
  const exact = new Set(entries)
  const hosts = new Set<string>()
  for (const entry of entries) {
    if (!entry.includes(':')) hosts.add(entry.replace(/^\[|\]$/g, ''))
  }
  return (host, port) => {
    const key = `${host}:${port}`
    if (exact.has(key) || exact.has(host)) return true
    return port !== '' && hosts.has(host)
  }
}

/**
 * The sidebar's own loopback classification for URL gates that mirror the
 * client address bar (browser.probe and the `sidebar_open` tool). Mirrors
 * `isLoopbackUrl` in src/client/browser.ts — keep the two in sync. Unlike
 * the fence's `isLoopbackHostname` (which matches the fork /api gateway and
 * covers localhost / [::1] / 127/8 only), this predicate also treats the
 * unspecified address `0.0.0.0` as loopback.
 * @param hostname - WHATWG URL hostname (lowercased by URL parsing).
 */
export function isSidebarLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

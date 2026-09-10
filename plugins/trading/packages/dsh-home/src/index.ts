/** Trading-owned data lives below the current host home, without startup migration. */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export { writeJsonAtomic } from './fs-atomic.ts'

/** Expand the host-supported home prefix before resolving a relative path. */
function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return resolve(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the native trading data directory under `$DSH_HOME/trading`.
 * @param env - Host environment; blank DSH_HOME uses the normal ~/.dsh home.
 * @returns Absolute directory for trading stores, separate from host settings and sessions.
 */
export function dshHomeDir(env: Record<string, string | undefined> = process.env): string {
  const configured = env.DSH_HOME
  const hostHome = configured !== undefined && configured.trim().length > 0
    ? resolve(expandHomePath(configured))
    : join(homedir(), '.dsh')
  return join(hostHome, 'trading')
}

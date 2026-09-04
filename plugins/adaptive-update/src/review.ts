/** Pure repository-diff projection used by the compatibility report. */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const PACKAGE_PATH = /^(packages\/[^/]+\/[^/]+)\//u

/**
 * Project changed paths into fixed risk identifiers ordered by product impact.
 * @param paths - repository-relative paths changed by either merge side.
 * @returns unique risk identifiers in product-impact order.
 */
export function riskAreasFor(paths: readonly string[]): string[] {
  const areas: string[] = []
  const includes = (pattern: RegExp): boolean => paths.some(path => pattern.test(path))
  if (includes(/^packages\/client\//u)) areas.push('client-plugins')
  if (includes(/^packages\/host\//u)) areas.push('host-api')
  if (includes(/(^|\/)(cordis\.patch\.yml|profile|bundle)(\/|$)/u)) areas.push('profile-composition')
  if (includes(/(^|\/)settings?(\/|\.|-)/u)) areas.push('settings')
  if (includes(/(^|\/)session(\/|-)|migration|resources\/sql/u)) areas.push('session-persistence')
  if (includes(/(^|\/)attachment(\/|-)/u)) areas.push('attachments')
  return areas
}

/**
 * Resolve package names for files changed on both sides of the merge base.
 * @param repositoryRoot - current source checkout.
 * @param paths - overlapping or directly conflicting file paths.
 * @returns unique manifest names in lexical order.
 */
export async function impactedPluginNames(repositoryRoot: string, paths: readonly string[]): Promise<string[]> {
  const roots = [...new Set(paths.flatMap((path) => {
    const match = PACKAGE_PATH.exec(path)
    return match?.[1] === undefined ? [] : [match[1]]
  }))].sort()
  const names: string[] = []
  for (const root of roots) {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, root, 'package.json'), 'utf8')) as { name?: unknown }
    names.push(typeof manifest.name === 'string' && manifest.name !== '' ? manifest.name : root)
  }
  return [...new Set(names)].sort()
}

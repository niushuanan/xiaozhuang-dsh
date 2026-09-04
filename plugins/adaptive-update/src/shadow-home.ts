/** Minimal private DSH Home for stable review and adaptation Agents. */

import { mkdir, open, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const SHADOW_FILES = ['.env', '.credentials.yaml', 'settings.yaml', 'AGENTS.md', 'SYSTEM.md'] as const

async function copyPrivateFile(source: string, destination: string): Promise<void> {
  const info = await stat(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (info === undefined) return
  if (!info.isFile()) throw new Error(`continuous adaptation private input is not a file: ${source}`)
  const content = await readFile(source)
  const handle = await open(destination, 'wx', 0o600)
  try {
    await handle.writeFile(content)
  } finally {
    await handle.close()
  }
}

/**
 * Copy only the configuration required by a stable headless Agent.
 * @param realHome - user's real DSH Home.
 * @param controlRoot - plugin-owned sibling control directory.
 * @param jobId - active operation id.
 * @returns the isolated shadow Home path.
 */
export async function createShadowHome(realHome: string, controlRoot: string, jobId: string): Promise<string> {
  const shadow = join(controlRoot, 'shadow-homes', jobId)
  await mkdir(shadow, { recursive: true, mode: 0o700 })
  for (const name of SHADOW_FILES) await copyPrivateFile(join(realHome, name), join(shadow, name))
  return shadow
}

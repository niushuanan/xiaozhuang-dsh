/** Bounded cleanup for adaptive-update-owned transient artifacts. */

import { lstat, mkdir, readdir, rm, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

const TRANSIENT_DIRECTORIES = ['reviews', 'candidates', 'shadow-homes'] as const

async function removeEntry(path: string): Promise<void> {
  const info = await lstat(path)
  if (info.isSymbolicLink()) {
    await unlink(path)
    return
  }
  await rm(path, { recursive: true, force: true })
}

async function removeChildren(directory: string, keep?: string): Promise<number> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const names = await readdir(directory)
  const removed = names.filter(name => name !== keep)
  for (const name of removed) await removeEntry(join(directory, name))
  return removed.length
}

/**
 * Remove completed transient artifacts and all but one previous-data snapshot.
 * @param controlRoot - fixed plugin-owned control directory.
 * @param options - complete snapshot path retained for rollback.
 * @returns removal counts for the update report.
 */
export async function pruneOwnedArtifacts(
  controlRoot: string,
  options: { keepSnapshot?: string } = {},
): Promise<{ removedTransient: number; removedSnapshots: number }> {
  let removedTransient = 0
  for (const name of TRANSIENT_DIRECTORIES) {
    removedTransient += await removeChildren(join(controlRoot, name))
  }
  removedTransient += await removeChildren(join(controlRoot, 'logs'))
  const snapshots = resolve(controlRoot, 'snapshots')
  let keepSnapshot: string | undefined
  if (options.keepSnapshot !== undefined) {
    const kept = resolve(options.keepSnapshot)
    if (dirname(kept) !== snapshots) throw new Error('continuous adaptation retained snapshot is outside the owned directory')
    keepSnapshot = basename(kept)
  }
  const removedSnapshots = await removeChildren(snapshots, keepSnapshot)
  return { removedTransient, removedSnapshots }
}

/** Copy-on-write whole-Home snapshot used only during the short cutover. */

import { lstat, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { requireCommand, runCommand } from './process.ts'

function requireSiblingRoots(dshHome: string, controlRoot: string): void {
  if (dirname(dshHome) !== dirname(controlRoot)) {
    throw new Error('adaptive update control directory must be a sibling of DSH Home')
  }
}
/**
 * Create one filesystem copy-on-write snapshot after the current DSH stops.
 * @param dshHome - real user data directory.
 * @param controlRoot - plugin-owned sibling directory.
 * @param jobId - operation id used as the snapshot directory name.
 * @returns complete snapshot path.
 */
export async function createDataSnapshot(
  dshHome: string,
  controlRoot: string,
  jobId: string,
): Promise<string> {
  requireSiblingRoots(dshHome, controlRoot)
  const info = await lstat(dshHome)
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('DSH Home must be a real directory for an atomic data snapshot')
  }
  const snapshots = join(controlRoot, 'snapshots')
  const snapshot = join(snapshots, jobId)
  await mkdir(snapshots, { recursive: true, mode: 0o700 })
  await rm(snapshot, { recursive: true, force: true })
  const command = process.platform === 'darwin' ? '/bin/cp' : 'cp'
  const args = process.platform === 'darwin'
    ? ['-cR', dshHome, snapshot]
    : ['--reflink=always', '-a', dshHome, snapshot]
  if (process.platform === 'win32') throw new Error('copy-on-write DSH snapshots are not available on Windows')
  const result = await runCommand(command, args, { cwd: dirname(dshHome), timeoutMs: 300_000 })
  requireCommand('copy-on-write DSH data snapshot', result)
  return snapshot
}

/**
 * Atomically replace candidate-mutated data with its pre-cutover snapshot.
 * @param dshHome - real user data directory.
 * @param snapshotPath - snapshot created for this job.
 * @param controlRoot - plugin-owned sibling directory.
 * @param jobId - operation id used for failed-data quarantine.
 */
export async function restoreDataSnapshot(
  dshHome: string,
  snapshotPath: string,
  controlRoot: string,
  jobId: string,
): Promise<void> {
  requireSiblingRoots(dshHome, controlRoot)
  const expected = join(controlRoot, 'snapshots', jobId)
  if (snapshotPath !== expected) throw new Error('adaptive update snapshot does not belong to this job')
  const info = await lstat(snapshotPath)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('adaptive update snapshot is not a real directory')
  const failedRoot = join(controlRoot, 'failed-data')
  const failed = join(failedRoot, jobId)
  await mkdir(failedRoot, { recursive: true, mode: 0o700 })
  await rm(failed, { recursive: true, force: true })
  await rename(dshHome, failed)
  try {
    await rename(snapshotPath, dshHome)
  } catch (error) {
    await rename(failed, dshHome)
    throw error
  }
  await rm(failed, { recursive: true, force: true })
}

/** Stop-snapshot-switch-restart transaction with automatic rollback. */

/** Immutable inputs pinned by the verified candidate. */
export interface CutoverOptions {
  repositoryRoot: string
  dshHome: string
  controlRoot: string
  jobId: string
  currentCommit: string
  candidateCommit: string
  currentPid: number
}

/** Process, Git, and data operations owned by the detached worker. */
export interface CutoverDependencies {
  isCheckoutClean: (repositoryRoot: string) => Promise<boolean>
  waitForIdle: () => Promise<void>
  stopCurrent: (pid: number) => Promise<void>
  createSnapshot: (dshHome: string, controlRoot: string, jobId: string) => Promise<string>
  advanceCheckout: (repositoryRoot: string, commit: string) => Promise<void>
  waitForReadiness: () => Promise<boolean>
  spawnRuntime: () => Promise<number>
  stopCandidate: (pid: number | undefined) => Promise<void>
  restoreSnapshot: (dshHome: string, snapshotPath: string, controlRoot: string, jobId: string) => Promise<void>
}

/** Outcome returned after either the candidate or restored product is ready. */
export type CutoverResult = {
  status: 'completed' | 'rolled-back'
  snapshotPath: string
}

/** Recovery dependencies add an authoritative current checkout read. */
export type CutoverRecoveryDependencies = CutoverDependencies & {
  currentHead: (repositoryRoot: string) => Promise<string>
}

/**
 * Apply a verified candidate only after the usable product is idle and stopped.
 * @param options - pinned code, data, and process identity.
 * @param dependencies - concrete external-worker operations.
 * @returns completed or rolled-back only after real readiness.
 */
export async function applyCandidate(
  options: CutoverOptions,
  dependencies: CutoverDependencies,
): Promise<CutoverResult> {
  if (!await dependencies.isCheckoutClean(options.repositoryRoot)) {
    throw new Error('continuous adaptation requires a clean source checkout')
  }
  await dependencies.waitForIdle()
  await dependencies.stopCurrent(options.currentPid)
  let snapshotPath: string
  try {
    snapshotPath = await dependencies.createSnapshot(
      options.dshHome,
      options.controlRoot,
      options.jobId,
    )
  } catch {
    await dependencies.spawnRuntime()
    if (!await dependencies.waitForReadiness()) {
      throw new Error('continuous adaptation could not restart the unchanged product after snapshot failure')
    }
    return { status: 'rolled-back', snapshotPath: '' }
  }

  let candidatePid: number | undefined
  let ready = false
  try {
    await dependencies.advanceCheckout(options.repositoryRoot, options.candidateCommit)
    ready = await dependencies.waitForReadiness()
    if (!ready) {
      candidatePid = await dependencies.spawnRuntime()
      ready = await dependencies.waitForReadiness()
    }
  } catch {
    ready = false
  }
  if (ready) return { status: 'completed', snapshotPath }

  await dependencies.stopCandidate(candidatePid)
  await dependencies.advanceCheckout(options.repositoryRoot, options.currentCommit)
  await dependencies.restoreSnapshot(
    options.dshHome,
    snapshotPath,
    options.controlRoot,
    options.jobId,
  )
  await dependencies.spawnRuntime()
  if (!await dependencies.waitForReadiness()) {
    throw new Error('continuous adaptation rollback could not restore product readiness')
  }
  return { status: 'rolled-back', snapshotPath }
}

/**
 * Resume an interrupted applying phase from its durable transaction facts.
 * @param options - cutover inputs plus the snapshot published before checkout advance.
 * @param dependencies - external-worker operations and current HEAD reader.
 * @returns completed candidate or fully restored previous product.
 */
export async function recoverInterruptedCutover(
  options: CutoverOptions & { snapshotPath?: string },
  dependencies: CutoverRecoveryDependencies,
): Promise<CutoverResult> {
  const head = await dependencies.currentHead(options.repositoryRoot)
  if (head !== options.currentCommit && head !== options.candidateCommit) {
    throw new Error(`continuous adaptation cannot recover unexpected checkout ${head}`)
  }
  if (head === options.candidateCommit && await dependencies.waitForReadiness()) {
    if (options.snapshotPath === undefined) {
      throw new Error('continuous adaptation candidate is current but the data snapshot is not recorded')
    }
    return { status: 'completed', snapshotPath: options.snapshotPath }
  }

  await dependencies.stopCandidate(undefined)
  if (head !== options.currentCommit) {
    await dependencies.advanceCheckout(options.repositoryRoot, options.currentCommit)
  }
  if (options.snapshotPath !== undefined) {
    await dependencies.restoreSnapshot(
      options.dshHome,
      options.snapshotPath,
      options.controlRoot,
      options.jobId,
    )
  }
  await dependencies.spawnRuntime()
  if (!await dependencies.waitForReadiness()) {
    throw new Error('continuous adaptation interrupted rollback could not restore product readiness')
  }
  return { status: 'rolled-back', snapshotPath: options.snapshotPath ?? '' }
}

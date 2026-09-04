import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdaptiveUpdateApiError } from '../src/api.ts'
import { AdaptiveUpdateEngine, type EngineDependencies } from '../src/engine.ts'
import { UpdateStateStore } from '../src/state.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const controlRoot = await mkdtemp(join(tmpdir(), 'dsh-adaptive-engine-'))
  roots.push(controlRoot)
  const store = new UpdateStateStore(controlRoot)
  const dependencies: EngineDependencies = {
    inspectCheckout: vi.fn(async () => ({ commit: 'a'.repeat(40), clean: true })),
    spawnWorker: vi.fn(async () => 222),
    stopWorker: vi.fn(),
    isProcessAlive: vi.fn(() => false),
    newJobId: vi.fn(() => 'job-2'),
  }
  const engine = new AdaptiveUpdateEngine({
    controlRoot,
    repositoryRoot: '/repo',
    dshHome: '/home/.dsh',
    upstreamUrl: 'https://github.com/deepseek-ai/deepseek-harness.git',
    upstreamBranch: 'master',
    runtime: {
      command: '/usr/bin/node',
      args: ['/repo/apps/cli/src/bin.ts', '--profile', 'web'],
      cwd: '/workspace',
      baseUrl: 'http://127.0.0.1:3080',
      currentPid: 111,
      stableCommand: { command: '/usr/bin/node', argsPrefix: ['/repo/apps/cli/src/bin.ts'] },
    },
    isIdle: () => true,
  }, store, dependencies)
  return { controlRoot, store, dependencies, engine }
}

describe('AdaptiveUpdateEngine', () => {
  it('recovers a dead worker before starting a new job and writes no credentials to the job file', async () => {
    const { controlRoot, store, dependencies, engine } = await fixture()
    await store.begin({ jobId: 'job-1', currentCommit: 'f'.repeat(40), workerPid: 999 })

    const started = await engine.start()

    expect(started).toMatchObject({ jobId: 'job-2', workerPid: 222, phase: 'discovering' })
    expect(dependencies.spawnWorker).toHaveBeenCalledOnce()
    const jobPath = (dependencies.spawnWorker as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string
    const job = await readFile(jobPath, 'utf8')
    expect(job).toContain('deepseek-harness.git')
    expect(job).not.toMatch(/KEY|SECRET|TOKEN|PASSWORD/iu)
    expect(jobPath).toBe(join(controlRoot, 'jobs', 'job-2.json'))
  })

  it('keeps a live worker as the single active operation', async () => {
    const { store, dependencies, engine } = await fixture()
    await store.begin({ jobId: 'job-1', currentCommit: 'f'.repeat(40), workerPid: 999 })
    dependencies.isProcessAlive = vi.fn(() => true)

    await expect(engine.start()).rejects.toEqual(new AdaptiveUpdateApiError(409, '持续适配正在进行中'))
    expect(dependencies.spawnWorker).not.toHaveBeenCalled()
  })

  it('restarts the external worker to recover an interrupted applying transaction', async () => {
    const { controlRoot, store, dependencies, engine } = await fixture()
    await store.begin({ jobId: 'job-1', currentCommit: 'f'.repeat(40), workerPid: 999 })
    await store.transition('job-1', 'applying', {
      previousCommit: 'f'.repeat(40),
      candidateCommit: 'e'.repeat(40),
      snapshotPath: '/snapshot/job-1',
    })
    const jobPath = join(controlRoot, 'jobs', 'job-1.json')
    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(join(controlRoot, 'jobs'), { recursive: true })
        .then(() => writeFile(jobPath, '{}\n')))

    const recovered = await engine.recover()

    expect(recovered).toMatchObject({ phase: 'applying', workerPid: 222 })
    expect(dependencies.spawnWorker).toHaveBeenCalledWith(jobPath)
  })
})

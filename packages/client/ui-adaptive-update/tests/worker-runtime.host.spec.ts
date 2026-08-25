import { describe, expect, it } from 'vitest'
import { parseUpdateJob, repositoryRuntimeArgs } from '../src/worker-runtime.ts'

describe('adaptive update worker runtime boundary', () => {
  it('accepts the immutable no-secret job contract and rejects incomplete input', () => {
    const job = parseUpdateJob({
      schemaVersion: 1,
      jobId: 'job-1',
      repositoryRoot: '/repo',
      controlRoot: '/control',
      dshHome: '/home/.dsh',
      upstreamUrl: 'https://example.test/upstream.git',
      upstreamBranch: 'master',
      runtime: {
        command: '/usr/bin/node',
        args: ['--import', 'tsx/esm', '/repo/apps/cli/src/bin.ts', 'web'],
        cwd: '/repo',
        baseUrl: 'http://127.0.0.1:3080',
        currentPid: 123,
        stableCommand: {
          command: '/usr/bin/node',
          argsPrefix: ['--import', 'tsx/esm', '/repo/apps/cli/src/bin.ts'],
        },
      },
    })

    expect(job.jobId).toBe('job-1')
    expect(() => parseUpdateJob({ ...job, runtime: { ...job.runtime, currentPid: 0 } }))
      .toThrow('invalid adaptive update job')
  })

  it('replays repository-relative and absolute CLI paths in the candidate checkout', () => {
    expect(repositoryRuntimeArgs(
      ['--import', 'tsx/esm', '/repo/apps/cli/src/bin.ts', 'web'],
      '/repo',
      '/candidate',
    )).toEqual(['--import', 'tsx/esm', '/candidate/apps/cli/src/bin.ts', 'web'])
  })

  it('replaces an existing web port for shadow boot instead of duplicating CLI flags', () => {
    expect(repositoryRuntimeArgs(
      ['/repo/apps/cli/src/bin.ts', 'web', '--port', '3080', '--no-open'],
      '/repo',
      '/candidate',
      43123,
    )).toEqual(['/candidate/apps/cli/src/bin.ts', 'web', '--port', '43123', '--no-open'])

    expect(repositoryRuntimeArgs(
      ['/repo/apps/cli/src/bin.ts', 'web', '--port=3080'],
      '/repo',
      '/candidate',
      43123,
    )).toEqual(['/candidate/apps/cli/src/bin.ts', 'web', '--port', '43123', '--no-open'])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { StableAgentRunError } from '../src/agent-runner.ts'
import {
  completedAgentOutput, completeAgentTurns, parseUpdateJob, repositoryRuntimeArgs,
} from '../src/worker-runtime.ts'

describe('adaptive update worker runtime boundary', () => {
  it('rejects progress text and strips only an explicit atomic completion marker', () => {
    expect(() => completedAgentOutput('review', '子代理仍在深挖，等它们回来。'))
      .toThrow('incomplete review result')
    expect(completedAgentOutput('review', '完整审查报告\n[DSH_REVIEW_COMPLETE]'))
      .toBe('完整审查报告')
    expect(completedAgentOutput('adapt', '冲突已解决\n[DSH_ADAPTATION_COMPLETE]'))
      .toBe('冲突已解决')
  })

  it('continues in the same candidate after one bounded Agent turn times out', async () => {
    const runTurn = vi.fn()
      .mockRejectedValueOnce(new StableAgentRunError({
        stdout: '已修复共同根因，正在跑回放', stderr: '', exitCode: 0, signal: null, timedOut: true,
      }))
      .mockResolvedValueOnce('全部回放通过\n[DSH_ADAPTATION_COMPLETE]')

    const result = await completeAgentTurns('adapt', '修复候选版本', runTurn, 3)

    expect(result).toBe('全部回放通过')
    expect(runTurn).toHaveBeenCalledTimes(2)
    expect(runTurn.mock.calls[1]?.[0]).toContain('修复候选版本')
    expect(runTurn.mock.calls[1]?.[0]).toContain('同一个候选工作树')
  })

  it('continues incomplete progress without accepting it as an atomic result', async () => {
    const runTurn = vi.fn()
      .mockResolvedValueOnce('仍在分析 Web 回放失败')
      .mockResolvedValueOnce('候选已经完成\n[DSH_ADAPTATION_COMPLETE]')

    await expect(completeAgentTurns('adapt', '继续适配', runTurn, 2))
      .resolves.toBe('候选已经完成')
    expect(runTurn).toHaveBeenCalledTimes(2)
  })

  it('fails safely after the bounded continuation turns are exhausted', async () => {
    const failure = new StableAgentRunError({
      stdout: '仍未完成', stderr: '', exitCode: 0, signal: null, timedOut: true,
    })
    const runTurn = vi.fn(async () => { throw failure })

    await expect(completeAgentTurns('adapt', '修复候选版本', runTurn, 3)).rejects.toBe(failure)
    expect(runTurn).toHaveBeenCalledTimes(3)
  })

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

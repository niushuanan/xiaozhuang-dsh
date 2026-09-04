/** Conflict-focused preparation shared by the detached worker and unit tests. */

import type { StableCommand } from './agent-runner.ts'
import type { RepositoryReview } from './repository.ts'
import type { CompatibilityReport, UpdatePhase } from './types.ts'

/** Completion marker required from every candidate adaptation task. */
export const ADAPTATION_COMPLETE = '[DSH_ADAPTATION_COMPLETE]'

const CLEAN_COMPATIBILITY_TIMEOUT_MS = 5 * 60_000

/** Inputs fixed before the detached operation begins. */
export interface PreparationOptions {
  repositoryRoot: string
  controlRoot: string
  realHome: string
  shadowHome: string
  jobId: string
  upstreamUrl: string
  upstreamBranch: string
  stableCommand: StableCommand
}
/** Injectable operation edges; real implementations use Git and stable DSH. */
export interface PreparationDependencies {
  createReview: (options: PreparationOptions) => Promise<RepositoryReview>
  removeReview: (repositoryRoot: string, reviewPath: string) => Promise<void>
  createCandidate: (
    options: PreparationOptions,
    currentCommit: string,
    upstreamCommit: string,
  ) => Promise<string>
  runAgent: (options: {
    cwd: string
    shadowHome: string
    stableCommand: StableCommand
    task: string
    timeoutMs: number | null
  }) => Promise<string>
  assertCandidateResolved: (candidatePath: string, currentCommit: string) => Promise<void>
  publish: (phase: UpdatePhase, patch?: Record<string, unknown>) => Promise<void>
}

/** Candidate and report produced before deterministic validation begins. */
export interface PreparedCandidate {
  candidatePath: string
  currentCommit: string
  upstreamCommit: string
  report: CompatibilityReport
}

function adaptationTask(report: CompatibilityReport): { task: string; timeoutMs: number | null } {
  if (report.conflictFiles.length === 0) {
    return {
      timeoutMs: CLEAN_COMPATIBILITY_TIMEOUT_MS,
      task: [
        '你正在“持续适配”的独立候选工作树中，锁定的官方提交已完成 Git 无冲突合并。',
        '只检查上游改动与下面本地插件重叠文件及其直接契约；范围必须极窄，兼容则不修改任何文件。',
        '只有发现与这些重叠或直接契约有关的明确兼容问题时，才做最小修复。',
        '不做广泛 review 或全仓审查，不要运行测试、回放、构建或依赖安装，不修改文档、不重构。',
        '不要 git commit，不要修改真实 DSH_HOME，不要启动或停止当前产品，不要启动子代理或后台任务。',
        `极窄兼容清单：${JSON.stringify({
          overlappingFiles: report.overlappingFiles,
          directlyImpactedPlugins: report.impactedPlugins,
        })}`,
        `在约 5 分钟内完成检查或最小修复，简要说明结果；最后一行必须且只能是 ${ADAPTATION_COMPLETE}。`,
      ].join('\n\n'),
    }
  }
  return {
    timeoutMs: null,
    task: [
      '你正在“持续适配”的独立候选工作树中，本地产品已与锁定的官方提交执行 --no-commit 合并。',
      '本次不设超时，但必须严格只处理下面的实际冲突文件及其直接编译依赖，不做全仓审查、不重构、不扩大范围。',
      '优先保留官方最新原生能力，同时保留冲突处涉及的本地产品行为和用户数据合同。',
      '“持续适配”必须保留独立候选区、空闲切换、数据快照和失败回滚。',
      '不要运行测试、回放、构建或依赖安装；外部工人只会执行一次依赖准备和一次生产构建。',
      '不要 git commit，不要修改真实 DSH_HOME，不要启动或停止当前产品，不要启动子代理或后台任务。',
      `窄范围合并清单：${JSON.stringify({
        conflictFiles: report.conflictFiles,
        directlyImpactedPlugins: report.impactedPlugins,
      })}`,
      `解决全部冲突后简要说明改动，最后一行必须且只能是 ${ADAPTATION_COMPLETE}。`,
    ].join('\n\n'),
  }
}

/**
 * Inspect a disposable trial merge, then run a scope-matched Agent in a second worktree.
 * @param options - immutable job inputs.
 * @param dependencies - real or scripted operation edges.
 * @returns the resolved candidate and deterministic conflict inventory.
 */
export async function prepareUpdateCandidate(
  options: PreparationOptions,
  dependencies: PreparationDependencies,
): Promise<PreparedCandidate> {
  const review = await dependencies.createReview(options)
  const report = review.report
  await dependencies.publish('reviewing', {
    upstreamCommit: review.upstreamCommit,
    report,
  })
  await dependencies.removeReview(options.repositoryRoot, review.reviewPath)

  const candidatePath = await dependencies.createCandidate(
    options,
    review.currentCommit,
    review.upstreamCommit,
  )
  await dependencies.publish('adapting', { report })
  const adaptation = adaptationTask(report)
  await dependencies.runAgent({
    cwd: candidatePath,
    shadowHome: options.shadowHome,
    stableCommand: options.stableCommand,
    ...adaptation,
  })
  await dependencies.assertCandidateResolved(candidatePath, review.currentCommit)
  return {
    candidatePath,
    currentCommit: review.currentCommit,
    upstreamCommit: review.upstreamCommit,
    report,
  }
}

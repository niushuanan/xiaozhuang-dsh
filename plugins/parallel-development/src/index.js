/**
 * Teamwork parallel development — native multi-worktree orchestration.
 *
 * The model decides whether the task benefits from parallelism and supplies
 * task packets. The host owns every Git/worktree operation, fresh-agent run,
 * review pass, integration merge, and final target-branch guard.
 */
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'parallel-development'
export const inject = ['tools', 'subagents', 'systemPrompt', 'webServer']

const execFileAsync = promisify(execFile)
const ROUTE_PATH = '/plugins/parallel-development'
const DATA_ROOT = join(homedir(), '.dsh', 'parallel-development')
const RUNS_DIR = join(DATA_ROOT, 'runs')
const WORKTREES_DIR = join(DATA_ROOT, 'worktrees')
const DEFAULT_PARALLEL = 3
const MAX_PARALLEL = 5
const GIT_IDENTITY = ['-c', 'user.name=DSH Teamwork', '-c', 'user.email=teamwork@localhost']
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'changes-required'], required: true },
    summary: { type: 'string', required: true },
    findings: { type: 'array', items: { type: 'string' }, required: true },
  },
}

function isTeamwork(session) {
  if (session == null) return false
  const events = typeof session.snapshotEvents === 'function'
    ? session.snapshotEvents()
    : session.events ?? []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'teamwork/state' && typeof event.data?.active === 'boolean') return event.data.active
  }
  return false
}

function shortError(error) {
  if (error == null) return '未知错误'
  const base = error instanceof Error ? error.message : String(error)
  const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : ''
  return (stderr || base).slice(0, 1200)
}

async function command(file, args, cwd, signal) {
  const result = await execFileAsync(file, args, {
    cwd,
    signal,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  })
  return { stdout: String(result.stdout ?? '').trim(), stderr: String(result.stderr ?? '').trim() }
}

function git(cwd, args, signal) {
  return command('git', args, cwd, signal)
}

function gitCommit(cwd, args, signal) {
  return git(cwd, [...GIT_IDENTITY, ...args], signal)
}

async function gitText(cwd, args, signal) {
  return (await git(cwd, args, signal)).stdout
}

async function isClean(cwd, signal) {
  return (await gitText(cwd, ['status', '--porcelain=v1', '--untracked-files=all'], signal)) === ''
}

function textOutput(result) {
  return (result.output ?? [])
    .filter(block => block?.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

function publicRun(run) {
  return {
    id: run.id,
    sessionId: run.sessionId,
    goal: run.goal,
    repoName: run.repoName,
    targetBranch: run.targetBranch,
    integrationBranch: run.integrationBranch,
    integrationWorktree: run.integrationWorktree,
    baseSha: run.baseSha,
    status: run.status,
    message: run.message,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt,
    maxParallel: run.maxParallel,
    autoMerged: run.autoMerged === true,
    lanes: run.lanes.map(lane => ({
      id: lane.id,
      title: lane.title,
      dependencies: lane.dependencies,
      status: lane.status,
      branch: lane.branch,
      childSessionId: lane.childSessionId,
      reviewSessionId: lane.reviewSessionId,
      summary: lane.summary,
      error: lane.error,
    })),
  }
}

function createStore() {
  const runs = new Map()
  const writes = new Map()
  const ready = (async () => {
    await mkdir(RUNS_DIR, { recursive: true })
    let files = []
    try { files = await readdir(RUNS_DIR) } catch {}
    const recent = files.filter(file => file.endsWith('.json')).sort().slice(-60)
    await Promise.all(recent.map(async (file) => {
      try {
        const parsed = JSON.parse(await readFile(join(RUNS_DIR, file), 'utf8'))
        if (typeof parsed?.id !== 'string' || !Array.isArray(parsed.lanes)) return
        if (['preparing', 'executing', 'reviewing', 'integrating', 'validating'].includes(parsed.status)) {
          parsed.status = 'interrupted'
          parsed.message = '上次运行被中断；已保留集成分支和 worktree。'
          parsed.updatedAt = Date.now()
        }
        runs.set(parsed.id, parsed)
      } catch {}
    }))
  })()

  const persist = async (run) => {
    await ready
    run.updatedAt = Date.now()
    const previous = writes.get(run.id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      const target = join(RUNS_DIR, run.id + '.json')
      const temp = target + '.tmp-' + process.pid
      await writeFile(temp, JSON.stringify(run, null, 2) + '\n', 'utf8')
      await rename(temp, target)
    })
    writes.set(run.id, next)
    await next
  }

  return { runs, ready, persist }
}

function normalizeTasks(rawTasks) {
  if (!Array.isArray(rawTasks) || rawTasks.length < 2 || rawTasks.length > MAX_PARALLEL) {
    throw new Error('并行开发需要 2 到 5 个可独立交付的任务包')
  }
  const tasks = rawTasks.map((raw, index) => ({
    id: `lane-${String(index + 1).padStart(2, '0')}`,
    sourceId: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : `task-${index + 1}`,
    title: typeof raw?.title === 'string' ? raw.title.trim() : '',
    instructions: typeof raw?.instructions === 'string' ? raw.instructions.trim() : '',
    dependencies: Array.isArray(raw?.dependencies)
      ? [...new Set(raw.dependencies.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))]
      : [],
  }))
  if (tasks.some(task => !task.title || !task.instructions)) throw new Error('每个并行任务都必须包含 title 和 instructions')
  const bySourceId = new Map()
  for (const task of tasks) {
    if (bySourceId.has(task.sourceId)) throw new Error(`任务 id 重复：${task.sourceId}`)
    bySourceId.set(task.sourceId, task)
  }
  for (const task of tasks) {
    task.dependencies = task.dependencies.map(id => {
      const dependency = bySourceId.get(id)
      if (dependency === undefined) throw new Error(`任务 ${task.sourceId} 引用了不存在的依赖 ${id}`)
      if (dependency.id === task.id) throw new Error(`任务 ${task.sourceId} 不能依赖自身`)
      return dependency.id
    })
  }
  const pending = new Set(tasks.map(task => task.id))
  const resolved = new Set()
  while (pending.size > 0) {
    const ready = tasks.filter(task => pending.has(task.id) && task.dependencies.every(id => resolved.has(id)))
    if (ready.length === 0) throw new Error('并行任务依赖关系存在循环')
    for (const task of ready) { pending.delete(task.id); resolved.add(task.id) }
  }
  return tasks
}

async function runLimited(items, limit, worker) {
  let cursor = 0
  const slots = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index])
    }
  })
  await Promise.all(slots)
}

async function runChild(ctx, parent, options, signal) {
  const run = await ctx.subagents.start('spawn', {
    label: options.label,
    prompt: [{ type: 'text', text: options.prompt }],
    parent,
    signal,
    workingDirectory: options.cwd,
    maxDepth: 1,
    ...(options.outputSchema === undefined ? {} : { outputSchema: options.outputSchema }),
    persona: options.persona,
  })
  options.onPublished?.(String(run.id))
  try {
    return await run.result
  } finally {
    await run.dispose()
  }
}

async function commitPending(cwd, title, signal) {
  const before = await gitText(cwd, ['rev-parse', 'HEAD'], signal)
  if (!await isClean(cwd, signal)) {
    await git(cwd, ['add', '-A'], signal)
    await gitCommit(cwd, ['commit', '-m', title], signal)
  }
  const after = await gitText(cwd, ['rev-parse', 'HEAD'], signal)
  return { before, after, changed: before !== after }
}

function workerPrompt(goal, lane) {
  return [
    'You are one implementation lane in a Teamwork multi-worktree run.',
    `Overall goal: ${goal}`,
    `Your task: ${lane.title}`,
    lane.instructions,
    '',
    'The host already placed you in an isolated Git worktree. Work only on this task.',
    'First inspect the repository guidance (AGENTS.md and PROJECT_CONTEXT.md when present) and the relevant code.',
    'Implement a production-quality result and run focused validation for the files you changed.',
    'Do not create/switch worktrees or branches. Do not merge, rebase, reset, clean, stash, or commit; the host owns Git lifecycle.',
    'Do not delegate to other agents. Return a concise summary of files changed, behavior delivered, and validation evidence.',
  ].join('\n')
}

function reviewPrompt(goal, lane, baseSha) {
  return [
    'Act as an independent senior code reviewer. Do not edit any file and do not run destructive Git commands.',
    `Overall goal: ${goal}`,
    `Lane: ${lane.title}`,
    `Lane requirement: ${lane.instructions}`,
    `Review the committed diff from ${baseSha} to HEAD in the current worktree.`,
    'Focus on actual product behavior, correctness, regressions, maintainability, and whether focused validation is sufficient.',
    'Return pass only when this lane is safe to integrate. Findings must be concrete and actionable.',
  ].join('\n')
}

function fixerPrompt(goal, lane, review) {
  return [
    'You are fixing findings from an independent review in the same isolated worktree.',
    `Overall goal: ${goal}`,
    `Lane: ${lane.title}`,
    `Original requirement: ${lane.instructions}`,
    `Review summary: ${review.summary}`,
    'Findings:',
    ...(review.findings ?? []).map(item => `- ${item}`),
    '',
    'Inspect the current implementation, address every valid finding, and run focused validation.',
    'Do not create/switch branches or worktrees. Do not merge, rebase, reset, clean, stash, or commit.',
  ].join('\n')
}

async function reviewLane(ctx, parent, run, lane, baseSha, store, signal) {
  lane.status = 'reviewing'
  run.status = 'reviewing'
  await store.persist(run)
  const result = await runChild(ctx, parent, {
    label: `${lane.title} · 独立审查`,
    prompt: reviewPrompt(run.goal, lane, baseSha),
    cwd: lane.worktree,
    outputSchema: REVIEW_SCHEMA,
    persona: 'You are an independent senior reviewer. Inspect evidence, remain read-only, and report only concrete product-impacting findings.',
    onPublished: (id) => { lane.reviewSessionId = id; void store.persist(run) },
  }, signal)
  if (result.stopReason !== 'completed' || result.structured == null) {
    throw new Error(`独立审查未完成：${result.diagnostic ?? result.stopReason}`)
  }
  return result.structured
}

async function createLaneWorktree(repoRoot, branchRoot, integrationBranch, lane, runRoot, signal) {
  lane.branch = `${branchRoot}/${lane.id}`
  lane.worktree = join(runRoot, 'tasks', lane.id)
  const baseSha = await gitText(repoRoot, ['rev-parse', integrationBranch], signal)
  lane.baseSha = baseSha
  await mkdir(join(runRoot, 'tasks'), { recursive: true })
  await git(repoRoot, ['worktree', 'add', '-b', lane.branch, lane.worktree, baseSha], signal)
}

async function executeLane(ctx, parent, run, lane, store, signal) {
  try {
    await createLaneWorktree(run.repoRoot, run.branchRoot, run.integrationBranch, lane, run.runRoot, signal)
    lane.status = 'executing'
    await store.persist(run)
    const result = await runChild(ctx, parent, {
      label: lane.title,
      prompt: workerPrompt(run.goal, lane),
      cwd: lane.worktree,
      persona: 'You are an implementation lane. Deliver the assigned scope completely, validate it, and avoid work outside that scope.',
      onPublished: (id) => { lane.childSessionId = id; void store.persist(run) },
    }, signal)
    lane.summary = textOutput(result)
    if (result.stopReason !== 'completed') throw new Error(result.diagnostic ?? `执行结束原因：${result.stopReason}`)
    await commitPending(lane.worktree, `Teamwork: ${lane.title}`, signal)

    let review = await reviewLane(ctx, parent, run, lane, lane.baseSha, store, signal)
    if (review.verdict === 'changes-required') {
      lane.status = 'revising'
      lane.summary = review.summary
      await store.persist(run)
      const fix = await runChild(ctx, parent, {
        label: `${lane.title} · 修正`,
        prompt: fixerPrompt(run.goal, lane, review),
        cwd: lane.worktree,
        persona: 'You are a focused senior implementer. Fix the supplied review findings without widening scope.',
        onPublished: (id) => { lane.childSessionId = id; void store.persist(run) },
      }, signal)
      if (fix.stopReason !== 'completed') throw new Error(fix.diagnostic ?? `修正结束原因：${fix.stopReason}`)
      await commitPending(lane.worktree, `Teamwork review: ${lane.title}`, signal)
      review = await reviewLane(ctx, parent, run, lane, lane.baseSha, store, signal)
    }
    if (review.verdict !== 'pass') throw new Error(review.summary || '独立审查仍有未解决问题')
    lane.summary = review.summary
    lane.status = 'ready'
  } catch (error) {
    lane.status = signal.aborted ? 'interrupted' : 'failed'
    lane.error = shortError(error)
  }
  await store.persist(run)
}

async function mergeLane(ctx, parent, run, lane, store, signal) {
  run.status = 'integrating'
  lane.status = 'integrating'
  await store.persist(run)
  try {
    await gitCommit(run.integrationWorktree, ['merge', '--no-ff', '--no-edit', lane.branch], signal)
  } catch (mergeError) {
    const unresolved = await gitText(run.integrationWorktree, ['diff', '--name-only', '--diff-filter=U'], signal)
    if (!unresolved) throw mergeError
    const mergeResult = await runChild(ctx, parent, {
      label: `${lane.title} · 解决集成冲突`,
      cwd: run.integrationWorktree,
      persona: 'You are the integration owner. Resolve only the active merge conflict, preserve both validated intents, and do not commit.',
      prompt: [
        'Resolve the currently active Git merge conflict in this dedicated integration worktree.',
        `Overall goal: ${run.goal}`,
        `Incoming lane: ${lane.title}`,
        `Conflicted files:\n${unresolved}`,
        'Inspect both sides and preserve both validated behaviors. Run focused checks for the resolved files.',
        'Do not abort, reset, clean, switch branches, create worktrees, or commit. Leave all conflicts resolved and staged/unstaged changes intact.',
      ].join('\n'),
      onPublished: (id) => { lane.integrationSessionId = id; void store.persist(run) },
    }, signal)
    if (mergeResult.stopReason !== 'completed') throw new Error(mergeResult.diagnostic ?? '冲突解决代理未完成')
    const remaining = await gitText(run.integrationWorktree, ['diff', '--name-only', '--diff-filter=U'], signal)
    if (remaining) throw new Error(`仍有未解决冲突：${remaining.replaceAll('\n', '、')}`)
    await git(run.integrationWorktree, ['add', '-A'], signal)
    await gitCommit(run.integrationWorktree, ['commit', '--no-edit'], signal)
  }
  lane.status = 'integrated'
  await store.persist(run)
  try {
    await git(run.repoRoot, ['worktree', 'remove', lane.worktree], signal)
    // The lane is already preserved by the successful integration merge. The
    // target branch has not fast-forwarded yet, so `-d` would incorrectly keep
    // every temporary lane branch because it only checks the current HEAD.
    await git(run.repoRoot, ['branch', '-D', lane.branch], signal)
    lane.worktree = undefined
  } catch {}
  await store.persist(run)
}

async function finalValidation(ctx, parent, run, store, signal) {
  run.status = 'validating'
  run.message = '正在进行集成检查'
  await store.persist(run)
  const result = await runChild(ctx, parent, {
    label: '集成验证',
    cwd: run.integrationWorktree,
    persona: 'You are the senior integration owner. Validate the complete change, fix only integration defects, and leave a shippable worktree.',
    prompt: [
      'Validate the complete multi-worktree integration as a senior maintainer.',
      `Overall goal: ${run.goal}`,
      `Base commit: ${run.baseSha}`,
      'Inspect the full diff from the base commit to HEAD, check repository guidance, and run the highest-value focused tests/build checks for this change.',
      'Fix integration-only defects you find, but do not broaden scope. Do not switch branches, create worktrees, merge, rebase, reset, clean, stash, or commit.',
      'Return the exact validation performed and any remaining risk. A completed answer means you judge this integration ready for guarded delivery.',
    ].join('\n'),
    onPublished: (id) => { run.integrationSessionId = id; void store.persist(run) },
  }, signal)
  if (result.stopReason !== 'completed') throw new Error(result.diagnostic ?? `集成验证结束原因：${result.stopReason}`)
  await commitPending(run.integrationWorktree, 'Teamwork: integration validation', signal)
  run.validationSummary = textOutput(result)
  await store.persist(run)
}

async function safeDeliver(run, signal) {
  const currentBranch = await gitText(run.repoRoot, ['branch', '--show-current'], signal)
  const currentHead = await gitText(run.repoRoot, ['rev-parse', 'HEAD'], signal)
  const clean = await isClean(run.repoRoot, signal)
  if (currentBranch !== run.targetBranch || currentHead !== run.baseSha || !clean) {
    return {
      merged: false,
      message: `集成已就绪，但目标工作区在运行期间发生变化。请检查 ${run.integrationBranch} 后再合入。`,
    }
  }
  await git(run.repoRoot, ['merge', '--ff-only', run.integrationBranch], signal)
  return { merged: true, message: `已安全快进合入 ${run.targetBranch}` }
}

async function cleanupDelivered(run, signal) {
  try { await git(run.repoRoot, ['worktree', 'remove', run.integrationWorktree], signal) } catch {}
  try { await git(run.repoRoot, ['branch', '-d', run.integrationBranch], signal) } catch {}
}

async function orchestrate(ctx, store, activeRepos, raw, exec) {
  await store.ready
  const parent = exec.agent
  if (parent == null) throw new Error('并行开发需要当前会话')
  if (!isTeamwork(parent.session)) throw new Error('请先开启 Teamwork，再使用并行开发')
  const parentCwd = parent.session.header.cwd
  if (typeof parentCwd !== 'string' || !parentCwd) throw new Error('当前会话没有工作区，无法创建 worktree')
  const tasks = normalizeTasks(raw.tasks)
  const repoRoot = await gitText(parentCwd, ['rev-parse', '--show-toplevel'], exec.signal)
  if (activeRepos.has(repoRoot)) throw new Error('这个仓库已有一组并行开发正在运行')
  const targetBranch = await gitText(repoRoot, ['branch', '--show-current'], exec.signal)
  if (!targetBranch) throw new Error('当前仓库处于 detached HEAD，无法安全自动集成')
  if (!await isClean(repoRoot, exec.signal)) {
    throw new Error('主工作区存在未提交改动。为避免漏掉或覆盖本地工作，请先提交当前改动，再启用多 worktree。')
  }

  const baseSha = await gitText(repoRoot, ['rev-parse', 'HEAD'], exec.signal)
  const id = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 8)
  const repoKey = createHash('sha256').update(repoRoot).digest('hex').slice(0, 12)
  const runRoot = join(WORKTREES_DIR, repoKey, id)
  const branchRoot = `dsh/parallel/${id}`
  const integrationBranch = `${branchRoot}/integration`
  const integrationWorktree = join(runRoot, 'integration')
  const maxParallel = Math.max(2, Math.min(MAX_PARALLEL, Number.isSafeInteger(raw.max_parallel) ? raw.max_parallel : DEFAULT_PARALLEL))
  const run = {
    id,
    sessionId: String(parent.id),
    goal: String(raw.goal ?? '').trim(),
    repoRoot,
    repoName: basename(repoRoot),
    targetBranch,
    baseSha,
    branchRoot,
    integrationBranch,
    integrationWorktree,
    runRoot,
    maxParallel,
    status: 'preparing',
    message: '正在准备隔离工作区',
    autoMerged: false,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    lanes: tasks.map(task => ({ ...task, status: 'pending' })),
  }
  if (!run.goal) throw new Error('并行开发需要清晰的整体目标')
  store.runs.set(id, run)
  activeRepos.set(repoRoot, id)
  await store.persist(run)

  try {
    await mkdir(runRoot, { recursive: true })
    await git(repoRoot, ['worktree', 'add', '-b', integrationBranch, integrationWorktree, baseSha], exec.signal)
    run.status = 'executing'
    run.message = `正在并行执行 ${run.lanes.length} 个任务`
    await store.persist(run)

    const pending = new Set(run.lanes.map(lane => lane.id))
    while (pending.size > 0) {
      const ready = run.lanes.filter(lane => pending.has(lane.id)
        && lane.dependencies.every(id => run.lanes.find(item => item.id === id)?.status === 'integrated'))
      if (ready.length === 0) {
        for (const lane of run.lanes.filter(item => pending.has(item.id))) {
          lane.status = 'blocked'
          lane.error = '依赖任务未成功集成'
          pending.delete(lane.id)
        }
        break
      }
      await runLimited(ready, maxParallel, lane => executeLane(ctx, parent, run, lane, store, exec.signal))
      for (const lane of ready) {
        pending.delete(lane.id)
        if (lane.status === 'ready') await mergeLane(ctx, parent, run, lane, store, exec.signal)
      }
    }

    const failed = run.lanes.filter(lane => lane.status !== 'integrated')
    if (failed.length > 0) throw new Error(`${failed.length} 个任务未通过执行或独立审查`)
    await finalValidation(ctx, parent, run, store, exec.signal)
    const delivery = await safeDeliver(run, exec.signal)
    run.autoMerged = delivery.merged
    run.status = delivery.merged ? 'completed' : 'ready'
    run.message = delivery.message
    run.finishedAt = Date.now()
    await store.persist(run)
    if (delivery.merged) await cleanupDelivered(run, exec.signal)
    return publicRun(run)
  } catch (error) {
    run.status = exec.signal.aborted ? 'interrupted' : 'needs-attention'
    run.message = `${shortError(error)}；已保留集成分支与 worktree，未改动目标分支。`
    run.finishedAt = Date.now()
    await store.persist(run)
    return publicRun(run)
  } finally {
    activeRepos.delete(repoRoot)
  }
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function createHandler(store) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== `${ROUTE_PATH}/api/runs`) return send(res, 404, { error: 'not found' })
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
    await store.ready
    const sessionId = url.searchParams.get('sessionId')
    const runs = [...store.runs.values()]
      .filter(run => sessionId == null || run.sessionId === sessionId)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 12)
      .map(publicRun)
    return send(res, 200, { enabled: true, runs })
  }
}

export function apply(ctx) {
  const store = createStore()
  const activeRepos = new Map()

  ctx.systemPrompt.context({
    name: 'teamwork:parallel-development',
    order: 131,
    text: ({ agent }) => isTeamwork(agent?.session) ? [
      'Parallel worktree development is available through teamwork_parallel after the user approves the plan.',
      'Decide automatically, but use it only when at least two file-writing tasks are truly independent, parallel execution materially shortens delivery, the Git workspace is clean, and the lanes do not need to share one dev server, database, generated artifact, or rapidly changing file.',
      'Stay in the ordinary single workspace for small/localized changes, tightly sequential refactors, migrations, broad shared-file edits, investigation-only work, or a dirty Git workspace.',
      'Supply 2-5 complete task packets with explicit dependencies. The tool owns worktree creation, native child agents, independent review, conflict integration, validation, and guarded delivery; do not duplicate those lane tasks with separate subagent calls.',
      'If guarded delivery cannot touch the target branch, clearly report the returned integration branch and worktree rather than attempting an unsafe merge yourself.',
    ].join('\n') : '',
  })

  ctx.tools.register(defineTool({
    name: 'teamwork_parallel',
    description: 'Teamwork 的原生多 worktree 开发工具。仅在计划已确认、Git 工作区干净，并且至少两个写代码任务可以真正独立推进时调用。宿主会自动创建隔离 worktree，并发运行原生子代理，逐任务独立审查，合入专用集成分支，执行最终验证；只有目标分支和基线完全未变化时才自动快进回写，否则保留集成分支供检查。不要用于小改动、强顺序任务、共享数据库/端口/生成物的任务或脏工作区。',
    parameters: {
      goal: { type: 'string', required: true, description: '用户已确认的完整交付目标。' },
      tasks: {
        type: 'array', required: true,
        description: '2-5 个边界清楚的任务包；相互独立的任务不要声明依赖。',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: '本次调用内唯一的短 id，用于 dependencies 引用。' },
            title: { type: 'string', required: true, description: '用户可理解的任务标题。' },
            instructions: { type: 'string', required: true, description: '完整实现范围、验收要求和高价值验证；子代理没有当前对话上下文。' },
            dependencies: { type: 'array', items: { type: 'string' }, description: '必须先完成的任务 id；无依赖时省略。' },
          },
        },
      },
      max_parallel: { type: 'integer', description: '同时执行数；默认 3，确有必要可提高到 5；宿主会限制在 2-5。' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{
        type: 'text',
        text: value.status === 'completed'
          ? `并行开发完成：${value.message}`
          : `并行开发状态：${value.message}\n集成分支：${value.integrationBranch}\n集成工作区：${value.integrationWorktree}`,
      }],
    },
    execute: (args, exec) => orchestrate(ctx, store, activeRepos, args, exec),
    timeoutMs: 4 * 60 * 60 * 1000,
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PATH,
    handler: createHandler(store),
  }), 'parallel-development: status api')
}

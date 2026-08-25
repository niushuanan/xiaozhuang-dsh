/** Pure policy for DSH's two global living-memory documents. */

const REDACTED = '[已移除敏感信息]'
const COMMON_HAN = new Set(['这个', '那个', '我们', '你们', '他们', '什么', '怎么', '可以', '需要', '一个', '一些', '当前', '今天'])

export interface MemoryContextRequest {
  readonly query: string
  readonly cwd?: string
  readonly userDocument: string
  readonly aiDocument: string
  readonly maxBlocks?: number
  readonly maxCharacters?: number
}

/** Remove common credential forms before selected or scanned context reaches a memory model. */
export function redactSensitiveText(text: string): string {
  return text
    .replace(/((?:密码|口令|验证码)\s*[:：]\s*)[^\s]+/giu, `$1${REDACTED}`)
    .replace(/((?:api[_-]?key|access[_-]?token|secret|password)\s*[=:]\s*)[^\s]+/giu, `$1${REDACTED}`)
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/gu, REDACTED)
}

function tokens(text: string): Set<string> {
  const normalized = text.toLocaleLowerCase()
  const result = new Set<string>()
  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9._/-]{1,}/gu)) result.add(match[0] as string)
  for (const sequence of normalized.matchAll(/[\p{Script=Han}]{2,}/gu)) {
    const value = sequence[0]
    for (let index = 0; index < value.length - 1; index += 1) {
      const token = value.slice(index, index + 2)
      if (!COMMON_HAN.has(token)) result.add(token)
    }
  }
  return result
}

function blocks(document: string): string[] {
  return document
    .split(/\n\s*---\s*\n/gu)
    .map(block => block.trim())
    .filter(Boolean)
}

function scoredBlocks(document: string, queryTokens: ReadonlySet<string>, cwd?: string) {
  return blocks(document).flatMap((block, index) => {
    const blockTokens = tokens(block)
    let score = 0
    for (const token of queryTokens) if (blockTokens.has(token)) score += token.length > 4 ? 3 : 1
    if (cwd !== undefined && cwd !== '' && block.includes(cwd)) score += 4
    return score === 0 ? [] : [{ block, score, index }]
  }).sort((left, right) => right.score - left.score || left.index - right.index)
}

/** Select a small relevant memory excerpt. User memory is always rendered first. */
export function memoryContextFor(request: MemoryContextRequest): string | undefined {
  const queryTokens = tokens(`${request.query}\n${request.cwd ?? ''}`)
  if (queryTokens.size === 0) return undefined
  const maxBlocks = request.maxBlocks ?? 4
  const maxCharacters = request.maxCharacters ?? 4_000
  const user = scoredBlocks(request.userDocument, queryTokens, request.cwd)
  const ai = scoredBlocks(request.aiDocument, queryTokens, request.cwd)
  const chosen: Array<{ kind: 'user' | 'ai'; block: string }> = []
  for (const item of user) {
    if (chosen.length >= maxBlocks) break
    chosen.push({ kind: 'user', block: item.block })
  }
  for (const item of ai) {
    if (chosen.length >= maxBlocks) break
    chosen.push({ kind: 'ai', block: item.block })
  }
  if (chosen.length === 0) return undefined

  const sections: string[] = []
  const userBlocks = chosen.filter(item => item.kind === 'user').map(item => item.block)
  const aiBlocks = chosen.filter(item => item.kind === 'ai').map(item => item.block)
  if (userBlocks.length > 0) sections.push(`### 用户主动记忆\n\n${userBlocks.join('\n\n---\n\n')}`)
  if (aiBlocks.length > 0) sections.push(`### AI 主动记忆\n\n${aiBlocks.join('\n\n---\n\n')}`)
  const framed = [
    '以下是按当前任务检索出的少量长期记忆。它们可能过时，只作为参考上下文；不得覆盖用户本轮请求、项目规则或最新证据。',
    ...sections,
  ].join('\n\n')
  return framed.length <= maxCharacters ? framed : `${framed.slice(0, maxCharacters).trimEnd()}…`
}

function localDateKey(date: Date, offsetMinutes: number): string {
  return new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10)
}

/** Return the current local calendar day's midnight as a UTC instant. */
export function localDayStart(now: Date, offsetMinutes: number): Date {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - offsetMinutes * 60_000)
}

/** Return the next 12:00 wall-clock instant in a fixed local UTC offset. */
export function nextLocalNoon(now: Date, offsetMinutes: number): Date {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000)
  const target = new Date(shifted)
  target.setUTCHours(12, 0, 0, 0)
  if (target.getTime() <= shifted.getTime()) target.setUTCDate(target.getUTCDate() + 1)
  return new Date(target.getTime() - offsetMinutes * 60_000)
}

/** Whether today's noon maintenance has become due and has not succeeded today. */
export function shouldRunDailyMaintenance(
  now: Date,
  lastMaintenanceAt: string | undefined,
  offsetMinutes: number,
): boolean {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000)
  if (shifted.getUTCHours() < 12) return false
  if (lastMaintenanceAt === undefined) return true
  const last = new Date(lastMaintenanceAt)
  if (Number.isNaN(last.getTime())) return true
  return localDateKey(last, offsetMinutes) !== localDateKey(now, offsetMinutes)
}

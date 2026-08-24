import type {
  PendingInteractionStatus, SessionId, SessionListState, SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'

export type CompanionBaseState = 'idle' | 'working' | 'waiting'

export interface CompanionActivity {
  state: CompanionBaseState
  running: number
  waiting: number
  focusTitle: string | null
  latestUpdate: number
}

export interface CompanionTask {
  id: SessionId
  title: string
  current: boolean
  status: 'working' | PendingInteractionStatus
  updatedAt: number
}

/**
 * Project every live or attention-blocked conversation into one compact switcher row.
 * Attention comes first, followed by the open conversation and then the freshest work.
 */
export function deriveCompanionTasks(sessions: SessionListState): CompanionTask[] {
  return sessions.ids
    .map(id => sessions.byId[id])
    .filter((row): row is SessionSummary => (
      row !== undefined && (row.running || row.pendingInteraction !== undefined)
    ))
    .map((row): CompanionTask => ({
      id: row.id,
      title: row.displayTitle,
      current: row.id === sessions.current,
      status: row.pendingInteraction ?? 'working',
      updatedAt: row.updatedAt,
    }))
    .sort((left, right) => {
      const leftNeedsAttention = left.status === 'working' ? 0 : 1
      const rightNeedsAttention = right.status === 'working' ? 0 : 1
      if (leftNeedsAttention !== rightNeedsAttention) return rightNeedsAttention - leftNeedsAttention
      if (left.current !== right.current) return left.current ? -1 : 1
      return right.updatedAt - left.updatedAt
    })
}

/** Derive one calm companion state from the same session facts visible in the sidebar. */
export function deriveCompanionActivity(sessions: SessionListState): CompanionActivity {
  const rows: SessionSummary[] = sessions.ids
    .map(id => sessions.byId[id])
    .filter((row): row is SessionSummary => row !== undefined)
  const waitingRows = rows.filter(row => row.pendingInteraction !== undefined)
  const runningRows = rows.filter(row => row.running)
  const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
  const focus = current?.pendingInteraction !== undefined
    ? current
    : waitingRows[0] ?? (current?.running === true ? current : runningRows[0])
  return {
    state: waitingRows.length > 0 ? 'waiting' : runningRows.length > 0 ? 'working' : 'idle',
    running: runningRows.length,
    waiting: waitingRows.length,
    focusTitle: focus?.displayTitle ?? null,
    latestUpdate: rows.reduce((latest, row) => Math.max(latest, row.updatedAt), 0),
  }
}

/** Project current public Session projections and job rosters for the workbench. */
import type { Context } from '../context-types.ts'
import type { SidebarSessionList, SidebarSubagentCatalog } from '../context-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IJobs } from '@deepseek-ai/dsh-api-job-controller/client'
import type {} from '@deepseek-ai/dsh-subagent/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

export interface WorkbenchSessionFeed {
  getSnapshot(): SidebarSessionList
  subscribe(listener: () => void): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context { betterSidebarSessionFeed: WorkbenchSessionFeed }
}

export function createWorkbenchSessionFeed(ctx: Context): WorkbenchSessionFeed {
  const sessions = ctx.sessions as unknown as ISessions
  const jobs = ctx.get('jobs') as unknown as IJobs | undefined
  let cachedList: ReturnType<ISessions['list']['getSnapshot']> | undefined
  let cachedJobs: ReturnType<IJobs['state']['getSnapshot']> | undefined
  let cachedStatus: ReturnType<typeof ctx.uiSession.sessionStatus.getSnapshot> | undefined
  let snapshot: SidebarSessionList = { byId: {} }
  return {
    getSnapshot() {
      const list = sessions.list.getSnapshot()
      const jobState = jobs?.state.getSnapshot()
      const status = ctx.uiSession.sessionStatus.getSnapshot()
      if (list === cachedList && jobState === cachedJobs && status === cachedStatus) return snapshot
      cachedList = list; cachedJobs = jobState; cachedStatus = status
      const catalogs: Record<string, SidebarSubagentCatalog> = {}
      for (const [id, projection] of Object.entries(list.projectionsBySession)) {
        const entries = projection.values.subagentCatalog
        catalogs[id] = {
          state: projection.state === 'idle' ? entries === undefined ? 'loading' : 'ready' : projection.state,
          error: projection.error,
          entries: (entries ?? []).map(entry => entry.mode === 'unknown'
            ? { kind: 'diagnostic' as const, id: entry.id, reason: 'unavailable' as const }
            : {
              ...entry, kind: 'child' as const,
              hasChildren: (list.projectionsBySession[entry.id]?.values.subagentCatalog?.length ?? 0) > 0
                || Object.values(list.byId).some(row => row.parentId === entry.id),
              activity: (status.get(entry.id)?.running ?? list.byId[entry.id]?.running) === true ? 'running' as const : 'inactive' as const,
            }),
        }
      }
      snapshot = { ...list, subagentsByParent: catalogs, ...(jobState === undefined ? {} : { jobsBySession: jobState.rows }) }
      return snapshot
    },
    subscribe(listener) {
      const disposers = [sessions.list.subscribe(listener), ctx.uiSession.sessionStatus.subscribe(listener)]
      if (jobs !== undefined) disposers.push(jobs.state.subscribe(listener))
      return () => { for (const dispose of disposers) dispose() }
    },
  }
}

export function workbenchSessionFeed(ctx: Context): WorkbenchSessionFeed {
  return ctx.get('betterSidebarSessionFeed') as WorkbenchSessionFeed ?? ctx.sessions.list
}

/** Own the real roster stream while a Session participates in the workbench. */
export function watchWorkbenchJobs(ctx: Context, sessionId: string): () => void {
  const jobs = ctx.get('jobs') as unknown as IJobs | undefined
  return jobs?.watchRows(sessionId as SessionId) ?? (() => {})
}

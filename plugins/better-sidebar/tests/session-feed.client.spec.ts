import { describe, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createWorkbenchSessionFeed } from '../src/client/session-feed.ts'

describe('workbench current public Session feed', () => {
  it('projects target catalog facts, running status and observed job rows into the workbench', () => {
    const list = createSnapshotStore({
      ids: ['parent'], byId: { parent: { id: 'parent' }, child: { id: 'child', parentId: 'parent', running: false } },
      phase: 'ready', projectionsBySession: {
        parent: { state: 'ready', error: null, values: { subagentCatalog: [{ id: 'child', createdAt: 1, mode: 'continuable', label: '核验' }] } },
        child: { state: 'ready', error: null, values: { subagentCatalog: [{ id: 'grandchild', createdAt: 2, mode: 'one-shot' }] } },
      },
    })
    const status = createSnapshotStore(new Map([['child', { running: true }]]))
    const jobs = createSnapshotStore({ rows: { parent: [{ id: 'bash-1', kind: 'bash', label: 'build', status: 'running', startedAt: 1 }] } })
    const feed = createWorkbenchSessionFeed({
      sessions: { list }, uiSession: { sessionStatus: status }, get: () => ({ state: jobs }),
    } as never)
    const first = feed.getSnapshot()
    expect(first.subagentsByParent?.parent?.entries[0]).toMatchObject({
      id: 'child', kind: 'child', mode: 'continuable', hasChildren: true, activity: 'running',
    })
    expect(first.jobsBySession?.parent?.[0]?.id).toBe('bash-1')
    expect(feed.getSnapshot()).toBe(first)
    status.set(new Map([['child', { running: false }]]))
    expect(feed.getSnapshot().subagentsByParent?.parent?.entries[0]).toMatchObject({ activity: 'inactive' })
  })
})

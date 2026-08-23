import { useSyncExternalStore } from 'react'

interface WorkspaceUiState {
  open: boolean
  width: number
  expanded: boolean
}

const DEFAULT_STATE: WorkspaceUiState = { open: false, width: 640, expanded: false }
const states = new Map<string, WorkspaceUiState>()
const listeners = new Map<string, Set<() => void>>()

function current(sessionId: string): WorkspaceUiState {
  return states.get(sessionId) ?? DEFAULT_STATE
}

function publish(sessionId: string, patch: Partial<WorkspaceUiState>): void {
  states.set(sessionId, { ...current(sessionId), ...patch })
  for (const listener of listeners.get(sessionId) ?? []) listener()
}

export function useWorkspaceUi(sessionId: string): WorkspaceUiState {
  return useSyncExternalStore(
    (listener) => {
      const set = listeners.get(sessionId) ?? new Set<() => void>()
      set.add(listener)
      listeners.set(sessionId, set)
      return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(sessionId)
      }
    },
    () => current(sessionId),
    () => DEFAULT_STATE,
  )
}

export const workspaceUi = {
  open(sessionId: string): void { publish(sessionId, { open: true }) },
  close(sessionId: string): void { publish(sessionId, { open: false, expanded: false }) },
  toggle(sessionId: string): void { publish(sessionId, { open: !current(sessionId).open }) },
  setWidth(sessionId: string, width: number): void {
    publish(sessionId, { width: Math.max(340, Math.min(1000, Math.round(width))) })
  },
  toggleExpanded(sessionId: string): void {
    const state = current(sessionId)
    publish(sessionId, { open: true, expanded: !state.expanded })
  },
}

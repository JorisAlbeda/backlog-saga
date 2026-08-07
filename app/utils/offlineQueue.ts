import type { Category, Todo } from '~~/shared/types'
import { getFaction } from '~~/shared/factions'

export type PendingAction =
  | { type: 'create', tempId: string, title: string, category: Category, status: 'pending' | 'failed' }
  | { type: 'patch', id: string, title?: string, category?: Category, status: 'pending' | 'failed' }
  | { type: 'complete' | 'reopen', id: string, status: 'pending' | 'failed' }
  | { type: 'delete', id: string, status: 'pending' | 'failed' }

const QUEUE_KEY = 'backlog-saga:pending-actions'

function targetId(action: PendingAction): string {
  return action.type === 'create' ? action.tempId : action.id
}

export function loadQueue(): PendingAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    // Corrupt queue or unreadable storage shouldn't crash the app — treat it as empty.
    console.warn('[offlineQueue] failed to load pending actions, resetting to empty', err)
    return []
  }
}

export function saveQueue(actions: PendingAction[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(actions))
  } catch (err) {
    // Storage unavailable (quota exceeded, disabled, sandboxed, etc.) shouldn't crash the app.
    // Logging the failure allows debugging without crashing.
    console.warn('[offlineQueue] failed to save pending actions', err)
  }
}

// A delete for a todo that was created offline and never synced means the
// server never needs to know it existed at all — drop both the create and
// every action queued against it instead of round-tripping a
// create-then-immediate-delete once reconnected.
export function enqueueAction(queue: PendingAction[], action: PendingAction): PendingAction[] {
  if (action.type === 'delete') {
    const createIdx = queue.findIndex(a => a.type === 'create' && a.tempId === action.id)
    if (createIdx !== -1) {
      return queue.filter(a => targetId(a) !== action.id)
    }
  }
  return [...queue, action]
}

// What the local cache should look like immediately after queuing this
// action, so the UI reflects your intent right away instead of waiting for
// a sync that might not happen for hours.
export function applyActionOptimistically(todos: Todo[], action: PendingAction): Todo[] {
  switch (action.type) {
    case 'create': {
      const todo: Todo = {
        id: action.tempId,
        title: action.title,
        createdAt: new Date().toISOString(),
        completedAt: null,
        guildStatus: 'init',
        category: action.category,
        text: { init: getFaction(action.category).initTemplate },
        chronicleWritten: false,
        version: 1
      }
      return [...todos, todo]
    }
    case 'patch': {
      return todos.map(t =>
        t.id === action.id
          ? { ...t, ...(action.title !== undefined ? { title: action.title } : {}), ...(action.category !== undefined ? { category: action.category } : {}) }
          : t
      )
    }
    case 'complete': {
      return todos.map(t => (t.id === action.id ? { ...t, completedAt: new Date().toISOString() } : t))
    }
    case 'reopen': {
      return todos.map(t =>
        t.id === action.id
          ? {
              ...t,
              completedAt: null,
              guildStatus: 'init',
              subtype: undefined,
              text: { init: getFaction(t.category).initTemplate },
              resultName: undefined,
              resultDetail: undefined,
              chronicleWritten: false
            }
          : t
      )
    }
    case 'delete': {
      return todos.filter(t => t.id !== action.id)
    }
  }
}

// Whether `id` belongs to a 'create' action still sitting in the queue,
// unsynced — i.e. the server has no record of this todo yet regardless
// of current reachability, so hitting the network for it would either
// get a misleading not-found (patch/complete/reopen) or leave a stale
// queued create to resurrect it later (delete).
export function isPendingCreate(queue: PendingAction[], id: string): boolean {
  return queue.some(a => a.type === 'create' && a.tempId === id)
}

// ofetch's FetchError carries a `.response` when the server actually
// responded (a real HTTP error status); a genuine network failure (PC
// unreachable) has none. That distinction is what decides whether a
// mutation should queue for later (network failure) or surface as a real
// error right now (an HTTP error from a reachable server) — see
// docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md.
export function isNetworkFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  return !('response' in err && (err as { response?: unknown }).response)
}

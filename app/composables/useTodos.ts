import type { Category, Todo, TodoNotFound } from '~~/shared/types'
import { isTodoNotFound } from '~~/shared/types'
import { loadCachedTodos, saveCachedTodos } from '../utils/offlineCache'
import {
  type PendingAction,
  loadQueue,
  saveQueue,
  enqueueAction,
  applyActionOptimistically,
  isNetworkFailure,
  isPendingCreate
} from '../utils/offlineQueue'
import { drainActions, reconcileQueueAfterDrain } from '../utils/drainQueue'
import { shouldAttemptBackgroundSync } from '../utils/backgroundSync'

// Module-scoped so every caller of useTodos() shares the same interval handle
// rather than each component starting its own poll loop.
let pollHandle: ReturnType<typeof setInterval> | undefined
let messageListenerAttached = false

export function useTodos() {
  const todos = useState<Todo[]>('todos', () => [])
  const lastSyncedAt = useState<number>('todos-last-synced', () => Date.now())
  const loading = useState<boolean>('todos-loading', () => false)
  const pendingActions = useState<PendingAction[]>('todos-pending-actions', () => [])

  // Cold start: show whatever we last knew before the first refresh()
  // resolves, so opening the app offline isn't a blank screen.
  if (import.meta.client && todos.value.length === 0) {
    const cached = loadCachedTodos()
    if (cached.length > 0) todos.value = cached
  }
  if (import.meta.client && pendingActions.value.length === 0) {
    pendingActions.value = loadQueue()
  }

  if (import.meta.client && !messageListenerAttached) {
    messageListenerAttached = true
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'background-sync-drain') {
        checkReachableAndDrain().catch(() => {})
      }
    })
  }

  const pendingIds = computed(() => new Set(pendingActions.value.map(a => (a.type === 'create' ? a.tempId : a.id))))

  const syncStatus = useState<'idle' | 'syncing'>('todos-sync-status', () => 'idle')
  const syncReport = useState<{ message: string, at: string }[]>('todos-sync-report', () => [])
  const failedCount = computed(() => pendingActions.value.filter(a => a.status === 'failed').length)

  function logSyncReport(message: string) {
    syncReport.value = [{ message, at: new Date().toISOString() }, ...syncReport.value].slice(0, 10)
  }

  async function replayAction(action: PendingAction): Promise<'applied' | 'discarded'> {
    switch (action.type) {
      case 'create':
        await $fetch(`/api/todos`, { method: 'POST', body: { id: action.tempId, title: action.title, category: action.category } })
        return 'applied'
      case 'patch': {
        const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${action.id}`, { method: 'PATCH', body: { title: action.title, category: action.category } })
        return isTodoNotFound(result) ? 'discarded' : 'applied'
      }
      case 'complete':
      case 'reopen': {
        const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${action.id}`, { method: 'PATCH', body: { action: action.type } })
        return isTodoNotFound(result) ? 'discarded' : 'applied'
      }
      case 'delete':
        await $fetch(`/api/todos/${action.id}`, { method: 'DELETE' })
        return 'applied'
    }
  }

  function describeAction(action: PendingAction): string {
    const target = action.type === 'create' ? action.title : action.id
    return `${action.type} (${target})`
  }

  async function drainQueue() {
    if (syncStatus.value === 'syncing') return
    const drainable = pendingActions.value.filter(a => a.status !== 'failed')
    if (drainable.length === 0) return

    syncStatus.value = 'syncing'
    const snapshot = pendingActions.value
    const { remaining, resolvedMessages, failedMessages, stoppedEarly } = await drainActions(
      snapshot,
      replayAction,
      describeAction
    )
    for (const message of resolvedMessages) logSyncReport(message)
    for (const message of failedMessages) logSyncReport(message)

    pendingActions.value = reconcileQueueAfterDrain(snapshot, pendingActions.value, remaining)
    persistQueue()
    syncStatus.value = 'idle'
    if (!stoppedEarly) {
      await refresh()
    }
  }

  async function checkReachableAndDrain() {
    try {
      await $fetch('/api/todos', { method: 'GET' })
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      // PC unreachable — nothing to do until the next poll tick.
      return
    }
    // drainQueue() already calls refresh() itself once it has actually
    // drained something; only do it here for the "queue was already empty"
    // case, where drainQueue() no-ops and skips that internal refresh —
    // otherwise a successful drain would trigger two refreshes back to back.
    const hadWork = pendingActions.value.some(a => a.status !== 'failed')
    await drainQueue()
    if (!hadWork) {
      await refresh()
    }
  }

  async function forceSync() {
    await checkReachableAndDrain()
  }

  function persistCache() {
    if (import.meta.client) saveCachedTodos(todos.value)
  }

  function persistQueue() {
    if (import.meta.client) saveQueue(pendingActions.value)
  }

  // Kept in sync manually with the identical constant in
  // service-worker/sw.ts — the app bundle and the service worker are built
  // separately and can't share a runtime import across that boundary, so
  // if you change this, change it there too.
  const SYNC_TAG = 'offline-queue-drain'

  async function registerBackgroundSync() {
    if (!import.meta.client) return
    const connection = (navigator as { connection?: { type?: string } }).connection
    if (!shouldAttemptBackgroundSync(connection)) return
    if (!('serviceWorker' in navigator)) return
    try {
      const registration = await navigator.serviceWorker.ready
      if ('sync' in registration) {
        await (registration as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register(SYNC_TAG)
      }
    } catch {
      // Background Sync isn't supported/available — the foreground poll
      // from Task 8 is still the primary mechanism, so this is a no-op.
    }
  }

  function queueAndApplyOptimistically(action: PendingAction) {
    pendingActions.value = enqueueAction(pendingActions.value, action)
    todos.value = applyActionOptimistically(todos.value, action)
    persistQueue()
    persistCache()
    registerBackgroundSync().catch(() => {})
  }

  async function refresh() {
    loading.value = true
    try {
      const server = await $fetch<Todo[]>('/api/todos')
      // Reconcile against the pending queue rather than a bare replace — a
      // wholesale overwrite here would silently erase unsynced optimistic
      // state (offline creates vanish, offline completes un-complete,
      // offline deletes reappear) any time a refresh succeeds while the
      // queue is still non-empty (initial mount, or drainQueue()'s own
      // trailing refresh after a partial/failed drain).
      todos.value = pendingActions.value.reduce(applyActionOptimistically, server)
      lastSyncedAt.value = Date.now()
      persistCache()
    } finally {
      loading.value = false
    }
  }

  async function createTodo(title: string, category: Category) {
    // crypto.randomUUID() is only defined in a secure context (HTTPS or
    // localhost) — calling it on a plain http://<lan-ip>:3000 origin (how
    // this app is meant to be reached from a phone) throws synchronously.
    // See README's "Offline / installing as an app" section for the
    // secure-context requirement this also implies for the PWA/service-worker
    // layer as a whole.
    const tempId = globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const todo = await $fetch<Todo>('/api/todos', { method: 'POST', body: { id: tempId, title, category } })
      todos.value = [...todos.value, todo]
      persistCache()
      return todo
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      const action: PendingAction = { type: 'create', tempId, title, category, status: 'pending' }
      queueAndApplyOptimistically(action)
      return todos.value.find(t => t.id === tempId)!
    }
  }

  async function editTodo(id: string, title: string, category: Category) {
    if (isPendingCreate(pendingActions.value, id)) {
      queueAndApplyOptimistically({ type: 'patch', id, title, category, status: 'pending' })
      return
    }
    try {
      const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${id}`, { method: 'PATCH', body: { title, category } })
      if (isTodoNotFound(result)) {
        todos.value = todos.value.filter(t => t.id !== id)
      } else {
        todos.value = todos.value.map(t => (t.id === id ? result : t))
      }
      persistCache()
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      queueAndApplyOptimistically({ type: 'patch', id, title, category, status: 'pending' })
    }
  }

  async function completeTodo(id: string) {
    if (isPendingCreate(pendingActions.value, id)) {
      queueAndApplyOptimistically({ type: 'complete', id, status: 'pending' })
      return todos.value.find(t => t.id === id)
    }
    try {
      const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${id}`, { method: 'PATCH', body: { action: 'complete' } })
      if (isTodoNotFound(result)) {
        todos.value = todos.value.filter(t => t.id !== id)
        persistCache()
        return undefined
      }
      todos.value = todos.value.map(t => (t.id === id ? result : t))
      persistCache()
      return result
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      queueAndApplyOptimistically({ type: 'complete', id, status: 'pending' })
      return todos.value.find(t => t.id === id)
    }
  }

  async function reopenTodo(id: string) {
    if (isPendingCreate(pendingActions.value, id)) {
      queueAndApplyOptimistically({ type: 'reopen', id, status: 'pending' })
      return todos.value.find(t => t.id === id)
    }
    try {
      const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${id}`, { method: 'PATCH', body: { action: 'reopen' } })
      if (isTodoNotFound(result)) {
        todos.value = todos.value.filter(t => t.id !== id)
        persistCache()
        return undefined
      }
      todos.value = todos.value.map(t => (t.id === id ? result : t))
      persistCache()
      return result
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      queueAndApplyOptimistically({ type: 'reopen', id, status: 'pending' })
      return todos.value.find(t => t.id === id)
    }
  }

  async function removeTodo(id: string) {
    if (isPendingCreate(pendingActions.value, id)) {
      queueAndApplyOptimistically({ type: 'delete', id, status: 'pending' })
      return
    }
    try {
      await $fetch(`/api/todos/${id}`, { method: 'DELETE' })
      todos.value = todos.value.filter(t => t.id !== id)
      persistCache()
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      queueAndApplyOptimistically({ type: 'delete', id, status: 'pending' })
    }
  }

  function startPolling() {
    if (pollHandle || !import.meta.client) return
    pollHandle = setInterval(() => {
      // If there's queued work, route the tick through the reachability
      // check + drain instead of a bare refresh() — refresh() alone
      // succeeds silently the moment the PC becomes reachable again and
      // never drains the queue; checkReachableAndDrain() already calls
      // refresh() internally once it's done, so this doesn't lose the
      // "reflect current server state" behavior of a normal poll tick.
      const hasWork = pendingActions.value.some(a => a.status !== 'failed')
      const tick = hasWork ? checkReachableAndDrain() : refresh()
      tick.catch((err) => {
        if (!isNetworkFailure(err)) console.error('[ledger] poll failed', err)
      })
    }, 15000)
  }

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle)
      pollHandle = undefined
    }
  }

  return {
    todos,
    lastSyncedAt,
    loading,
    pendingActions,
    pendingIds,
    syncStatus,
    syncReport,
    failedCount,
    refresh,
    createTodo,
    editTodo,
    completeTodo,
    reopenTodo,
    removeTodo,
    startPolling,
    stopPolling,
    forceSync
  }
}

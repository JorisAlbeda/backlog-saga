import type { Category, Todo, TodoNotFound } from '~~/shared/types'
import { isTodoNotFound } from '~~/shared/types'
import { loadCachedTodos, saveCachedTodos } from '../utils/offlineCache'
import {
  type PendingAction,
  loadQueue,
  saveQueue,
  enqueueAction,
  applyActionOptimistically,
  isNetworkFailure
} from '../utils/offlineQueue'
import { drainActions } from '../utils/drainQueue'

// Module-scoped so every caller of useTodos() shares the same interval handle
// rather than each component starting its own poll loop.
let pollHandle: ReturnType<typeof setInterval> | undefined

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
    const { remaining, resolvedMessages, failedMessages, stoppedEarly } = await drainActions(
      pendingActions.value,
      replayAction,
      describeAction
    )
    for (const message of resolvedMessages) logSyncReport(message)
    for (const message of failedMessages) logSyncReport(message)

    pendingActions.value = remaining
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

  function queueAndApplyOptimistically(action: PendingAction) {
    pendingActions.value = enqueueAction(pendingActions.value, action)
    todos.value = applyActionOptimistically(todos.value, action)
    persistQueue()
    persistCache()
  }

  async function refresh() {
    loading.value = true
    try {
      todos.value = await $fetch<Todo[]>('/api/todos')
      lastSyncedAt.value = Date.now()
      persistCache()
    } finally {
      loading.value = false
    }
  }

  async function createTodo(title: string, category: Category) {
    const tempId = crypto.randomUUID()
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
      refresh().catch((err) => {
        if (isNetworkFailure(err)) {
          checkReachableAndDrain().catch(() => {})
        } else {
          console.error('[ledger] poll refresh failed', err)
        }
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

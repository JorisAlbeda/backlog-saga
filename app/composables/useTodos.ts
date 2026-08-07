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
    pollHandle = setInterval(refresh, 15000)
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
    refresh,
    createTodo,
    editTodo,
    completeTodo,
    reopenTodo,
    removeTodo,
    startPolling,
    stopPolling
  }
}

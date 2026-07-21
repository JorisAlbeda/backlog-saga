import type { Todo } from '~~/shared/types'

// Module-scoped so every caller of useTodos() shares the same interval handle
// rather than each component starting its own poll loop.
let pollHandle: ReturnType<typeof setInterval> | undefined

export function useTodos() {
  const todos = useState<Todo[]>('todos', () => [])
  const lastSyncedAt = useState<number>('todos-last-synced', () => Date.now())
  const loading = useState<boolean>('todos-loading', () => false)

  async function refresh() {
    loading.value = true
    try {
      todos.value = await $fetch<Todo[]>('/api/todos')
      lastSyncedAt.value = Date.now()
    } finally {
      loading.value = false
    }
  }

  async function createTodo(title: string) {
    const todo = await $fetch<Todo>('/api/todos', { method: 'POST', body: { title } })
    todos.value = [...todos.value, todo]
    return todo
  }

  async function completeTodo(id: string) {
    const updated = await $fetch<Todo>(`/api/todos/${id}`, { method: 'PATCH', body: { action: 'complete' } })
    todos.value = todos.value.map(t => (t.id === id ? updated : t))
    return updated
  }

  async function reopenTodo(id: string) {
    const updated = await $fetch<Todo>(`/api/todos/${id}`, { method: 'PATCH', body: { action: 'reopen' } })
    todos.value = todos.value.map(t => (t.id === id ? updated : t))
    return updated
  }

  async function removeTodo(id: string) {
    await $fetch(`/api/todos/${id}`, { method: 'DELETE' })
    todos.value = todos.value.filter(t => t.id !== id)
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
    refresh,
    createTodo,
    completeTodo,
    reopenTodo,
    removeTodo,
    startPolling,
    stopPolling
  }
}

import type { Todo } from '~~/shared/types'

const CACHE_KEY = 'backlog-saga:todos-cache'

export function loadCachedTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    // Corrupt cache or unreadable storage shouldn't crash the app — treat it as empty and let
    // the next successful sync repopulate it.
    console.warn('[offlineCache] failed to load cached todos, resetting to empty', err)
    return []
  }
}

export function saveCachedTodos(todos: Todo[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(todos))
  } catch (err) {
    // Storage unavailable (quota exceeded, disabled, sandboxed, etc.) shouldn't crash the app.
    // Logging the failure allows debugging without crashing.
    console.warn('[offlineCache] failed to save cached todos', err)
  }
}

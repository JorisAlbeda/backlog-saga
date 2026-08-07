import type { Todo } from '~~/shared/types'

const CACHE_KEY = 'backlog-saga:todos-cache'

export function loadCachedTodos(): Todo[] {
  const raw = localStorage.getItem(CACHE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt cache shouldn't crash the app — treat it as empty and let
    // the next successful sync repopulate it.
    return []
  }
}

export function saveCachedTodos(todos: Todo[]): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(todos))
}

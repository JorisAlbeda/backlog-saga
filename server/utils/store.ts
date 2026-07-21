import type { ChronicleEntry, Todo } from '../../shared/types'

const TODOS_KEY = 'todos.json'
const CHRONICLE_KEY = 'chronicle.json'

function db() {
  return useStorage('data')
}

// The store is backed by a single JSON file per key and is called from two
// independent paths (HTTP request handlers and the guild:resolve scheduled
// task), so every read-modify-write sequence below is serialized through
// this in-process queue to prevent lost updates between concurrent callers.
let queue: Promise<void> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export async function listTodos(): Promise<Todo[]> {
  const todos = await db().getItem<Todo[]>(TODOS_KEY)
  return todos ?? []
}

async function saveTodos(todos: Todo[]) {
  await db().setItem(TODOS_KEY, todos)
}

export async function createTodo(title: string): Promise<Todo> {
  return withLock(async () => {
    const todos = await listTodos()
    const todo: Todo = {
      id: crypto.randomUUID(),
      title,
      createdAt: new Date().toISOString(),
      completedAt: null,
      guildStatus: 'init',
      text: { init: 'The Construction Guild is building.' },
      chronicleWritten: false,
      version: 1
    }
    todos.push(todo)
    await saveTodos(todos)
    return todo
  })
}

export async function getTodo(id: string): Promise<Todo | undefined> {
  const todos = await listTodos()
  return todos.find(t => t.id === id)
}

// `expectedVersion`, when passed, makes this an optimistic-concurrency write:
// if the stored todo's version no longer matches (it changed since the
// caller read it), the write is rejected and undefined is returned instead
// of silently overwriting the newer state.
export async function updateTodo(
  id: string,
  patch: Partial<Todo>,
  expectedVersion?: number
): Promise<Todo | undefined> {
  return withLock(async () => {
    const todos = await listTodos()
    const idx = todos.findIndex(t => t.id === id)
    if (idx === -1) return undefined
    if (expectedVersion !== undefined && todos[idx].version !== expectedVersion) return undefined
    todos[idx] = { ...todos[idx], ...patch, version: todos[idx].version + 1 }
    await saveTodos(todos)
    return todos[idx]
  })
}

export async function deleteTodo(id: string): Promise<boolean> {
  return withLock(async () => {
    const todos = await listTodos()
    const next = todos.filter(t => t.id !== id)
    if (next.length === todos.length) return false
    await saveTodos(next)
    return true
  })
}

export async function listChronicle(): Promise<ChronicleEntry[]> {
  const entries = await db().getItem<ChronicleEntry[]>(CHRONICLE_KEY)
  return entries ?? []
}

export async function appendChronicleEntry(entry: Omit<ChronicleEntry, 'number'>): Promise<ChronicleEntry> {
  return withLock(async () => {
    const entries = await listChronicle()
    const full: ChronicleEntry = { ...entry, number: entries.length + 1 }
    entries.push(full)
    await db().setItem(CHRONICLE_KEY, entries)
    return full
  })
}

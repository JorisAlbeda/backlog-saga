import type { Category, ChronicleEntry, Todo } from '../../shared/types'
import { CATEGORIES, FACTIONS } from '../../shared/factions'

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

// The guild-progress fields, reset to their pre-drafted state for a given
// category. Shared by createTodo and every place that needs to reset guild
// progress (category changed, task reopened) so they can't drift apart.
export function initialGuildState(
  category: Category
): Pick<Todo, 'guildStatus' | 'subtype' | 'text' | 'resultName' | 'resultDetail' | 'chronicleWritten'> {
  return {
    guildStatus: 'init',
    subtype: undefined,
    text: { init: FACTIONS[category].initTemplate },
    resultName: undefined,
    resultDetail: undefined,
    chronicleWritten: false
  }
}

export function assertValidCategory(category: unknown): asserts category is Category {
  if (typeof category !== 'string' || !CATEGORIES.includes(category as Category)) {
    throw createError({ statusCode: 400, statusMessage: `category must be one of: ${CATEGORIES.join(', ')}` })
  }
}

export async function createTodo(title: string, category: Category): Promise<Todo> {
  return withLock(async () => {
    const todos = await listTodos()
    const todo: Todo = {
      id: crypto.randomUUID(),
      title,
      createdAt: new Date().toISOString(),
      completedAt: null,
      category,
      ...initialGuildState(category),
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

// Two ways to call this:
//  - a plain patch object + `expectedVersion`: an optimistic-concurrency
//    write for callers (guild.ts) that read a todo, did slow async work
//    (an LLM call) based on that snapshot, and need the write rejected if
//    the todo changed underneath them in the meantime.
//  - an updater function `(current) => patch`: an atomic read-modify-write
//    for callers (the PATCH route) that can decide the patch entirely from
//    the live stored value, computed inside the same lock acquisition that
//    performs the write — no separate pre-read or version needed, and
//    "not found" is the only way this can fail.
export async function updateTodo(
  id: string,
  patchOrUpdater: Partial<Todo> | ((current: Todo) => Partial<Todo>),
  expectedVersion?: number
): Promise<Todo | undefined> {
  return withLock(async () => {
    const todos = await listTodos()
    const idx = todos.findIndex(t => t.id === id)
    if (idx === -1) return undefined
    if (expectedVersion !== undefined && todos[idx].version !== expectedVersion) return undefined
    const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(todos[idx]) : patchOrUpdater
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

import type { ChronicleEntry, Todo } from '../../shared/types'

const TODOS_KEY = 'todos.json'
const CHRONICLE_KEY = 'chronicle.json'

function db() {
  return useStorage('data')
}

export async function listTodos(): Promise<Todo[]> {
  const todos = await db().getItem<Todo[]>(TODOS_KEY)
  return todos ?? []
}

async function saveTodos(todos: Todo[]) {
  await db().setItem(TODOS_KEY, todos)
}

export async function createTodo(title: string): Promise<Todo> {
  const todos = await listTodos()
  const todo: Todo = {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
    completedAt: null,
    guildStatus: 'init',
    text: { init: 'The Construction Guild is building.' },
    chronicleWritten: false
  }
  todos.push(todo)
  await saveTodos(todos)
  return todo
}

export async function getTodo(id: string): Promise<Todo | undefined> {
  const todos = await listTodos()
  return todos.find(t => t.id === id)
}

export async function updateTodo(id: string, patch: Partial<Todo>): Promise<Todo | undefined> {
  const todos = await listTodos()
  const idx = todos.findIndex(t => t.id === id)
  if (idx === -1) return undefined
  todos[idx] = { ...todos[idx], ...patch }
  await saveTodos(todos)
  return todos[idx]
}

export async function deleteTodo(id: string): Promise<boolean> {
  const todos = await listTodos()
  const next = todos.filter(t => t.id !== id)
  if (next.length === todos.length) return false
  await saveTodos(next)
  return true
}

export async function listChronicle(): Promise<ChronicleEntry[]> {
  const entries = await db().getItem<ChronicleEntry[]>(CHRONICLE_KEY)
  return entries ?? []
}

export async function appendChronicleEntry(entry: Omit<ChronicleEntry, 'number'>): Promise<ChronicleEntry> {
  const entries = await listChronicle()
  const full: ChronicleEntry = { ...entry, number: entries.length + 1 }
  entries.push(full)
  await db().setItem(CHRONICLE_KEY, entries)
  return full
}

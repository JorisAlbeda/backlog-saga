export type GuildStatus = 'init' | 'categorised' | 'chronicled'

export interface Todo {
  id: string
  title: string
  createdAt: string
  completedAt: string | null
  guildStatus: GuildStatus
  category?: string
  text: {
    init: string
    categorised?: string
    chronicled?: string
  }
  buildingName?: string
  material?: string
  chronicleWritten: boolean
  // Bumped on every write. Callers that read a todo, do async work, then
  // write it back can pass the version they read to updateTodo() so a
  // write against data that changed underneath (e.g. reopened, deleted)
  // is rejected instead of silently clobbering the newer state.
  version: number
}

export type TaskState = 'todo' | 'taking-shape' | 'done'

export function getTaskState(todo: Pick<Todo, 'completedAt' | 'guildStatus'>): TaskState {
  if (!todo.completedAt) return 'todo'
  return todo.guildStatus === 'chronicled' ? 'done' : 'taking-shape'
}

export function currentGuildText(todo: Pick<Todo, 'guildStatus' | 'text'>): string {
  if (todo.guildStatus === 'chronicled' && todo.text.chronicled) return todo.text.chronicled
  if (todo.guildStatus === 'categorised' && todo.text.categorised) return todo.text.categorised
  return todo.text.init
}

export interface ChronicleEntry {
  number: number
  todoId: string
  buildingName: string
  material: string
  sourceTask: string
  dispatch: string
  builtAt: string
}

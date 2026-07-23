export type GuildStatus = 'init' | 'drafted' | 'chronicled'

// The faction the user picks for a task at creation. Fixed and determines
// which faction reacts to the task and which prompts are sent to the LLM —
// see shared/factions.ts for the per-category display/behavior config.
export type Category =
  | 'home-improvement'
  | 'cleaning'
  | 'communication-admin'
  | 'creation-inspiration'
  | 'health'

export interface Todo {
  id: string
  title: string
  createdAt: string
  completedAt: string | null
  guildStatus: GuildStatus
  category: Category
  // AI-inferred specific noun within the chosen category's domain (e.g.
  // "church" for a building, "a nature ritual" for a spell) — a glimpse of
  // what's to come, generated independently of task completion.
  subtype?: string
  text: {
    init: string
    drafted?: string
    chronicled?: string
  }
  resultName?: string
  resultDetail?: string
  chronicleWritten: boolean
  // Whether generateCodexEntry/writeCodexEntry actually produced a file in
  // the shared codex for this todo's result. chronicle.json/world-material
  // are written unconditionally once chronicled, so this is the only
  // record of whether the write-back itself succeeded, was skipped (e.g. a
  // slug collision), or was never configured. Undefined until the
  // write-back attempt runs.
  codexEntryWritten?: boolean
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
  if (todo.guildStatus === 'drafted' && todo.text.drafted) return todo.text.drafted
  return todo.text.init
}

export interface ChronicleEntry {
  number: number
  todoId: string
  category: Category
  subtype: string
  resultName: string
  resultDetail: string
  sourceTask: string
  dispatch: string
  builtAt: string
}

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

// Returned instead of a Todo by the mutation endpoints (PATCH/DELETE) when
// the target id doesn't exist — these endpoints are idempotent by design
// (see docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md), so
// "already gone" is a successful outcome, not an error. Distinguishable
// from a real Todo by the `status` field, which no Todo has.
export interface TodoNotFound {
  id: string
  status: 'not-found'
}

export function isTodoNotFound(value: Todo | TodoNotFound): value is TodoNotFound {
  return 'status' in value && value.status === 'not-found'
}

export type TaskState = 'todo' | 'taking-shape' | 'done'

export function getTaskState(todo: Pick<Todo, 'completedAt' | 'guildStatus'>): TaskState {
  if (!todo.completedAt) return 'todo'
  return todo.guildStatus === 'chronicled' ? 'done' : 'taking-shape'
}

// A `Done` todo is eligible for the daily retention sweep once more than
// `retentionDays` days have elapsed since it was completed. `retentionDays
// <= 0` means cleanup is disabled — nothing is ever eligible (0 is a
// deliberate off-switch, distinct from an unset/default value, which
// callers resolve before reaching here). `chronicleWritten` is checked
// redundantly with getTaskState's 'done' check — guild.ts always sets
// guildStatus: 'chronicled' and chronicleWritten: true together, only
// after the chronicle write actually succeeds — as a second, defensive
// guard against ever selecting a todo whose chronicle write didn't land.
export function isEligibleForCleanup(
  todo: Pick<Todo, 'completedAt' | 'guildStatus' | 'chronicleWritten'>,
  retentionDays: number,
  now: number = Date.now()
): boolean {
  if (retentionDays <= 0) return false
  if (getTaskState(todo) !== 'done') return false
  if (!todo.chronicleWritten) return false
  // Unreachable in practice: getTaskState above already guarantees
  // completedAt is set once state is 'done'. Kept only so TypeScript can
  // narrow completedAt from `string | null` to `string` before the
  // `new Date(...)` call below — not live defensive logic, do not remove.
  if (!todo.completedAt) return false
  const ageMs = now - new Date(todo.completedAt).getTime()
  return ageMs > retentionDays * 24 * 60 * 60 * 1000
}

// Resolves the raw TODO_RETENTION_DAYS env value into the number
// isEligibleForCleanup expects. Unset or empty -> the default of 7.
// Anything that doesn't parse to a finite number (including garbage
// strings) also falls back to 7 rather than silently producing NaN, which
// would make every isEligibleForCleanup call return false (via its own
// NaN-safe age comparison) but log a confusing "NaNd" message from the
// cleanup task. Pulled out of nuxt.config.ts as a named, directly testable
// function specifically because it guards the difference between "unset"
// (7) and "explicitly 0" (disabled) — the one distinction in this whole
// feature that must never regress silently, e.g. via someone later
// "simplifying" the config line to `Number(process.env.X) || 7`, which
// would turn an explicit opt-out back into the default and resume
// deleting a user's data.
export function resolveRetentionDays(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 7
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 7
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

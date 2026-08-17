# Todo Retention (Auto-Cleanup of Old Done Todos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically remove `Done` todos from the active Ledger once they've been completed for longer than a configurable retention window, since their content is already permanently preserved in the Chronicle.

**Architecture:** A pure eligibility predicate (`isEligibleForCleanup`) added next to `getTaskState` in `shared/types.ts`, consumed by a new `deleteOldDoneTodos` store function that runs the same `withLock`-guarded read-modify-write every other mutation in `server/utils/store.ts` uses, invoked once a day by a new Nitro scheduled task.

**Tech Stack:** Nuxt 4 / Nitro (existing `scheduledTasks` + `experimental.tasks`), Vitest (existing `test/shared/*.test.ts` and `test/server/*.e2e.test.ts` patterns).

## Global Constraints

- Only `Done` todos (`getTaskState(todo) === 'done'`) are ever candidates for removal — `To Do` and `Taking Shape` todos are never touched, regardless of age.
- A todo is eligible once **more than** `TODO_RETENTION_DAYS` days have elapsed since `completedAt` (strict `>`, not `>=`).
- `chronicleWritten === true` is required in addition to `getTaskState(todo) === 'done'` — a defensive, redundant guard (per `guild.ts`, the two are always set together) against ever deleting a todo whose chronicle write didn't actually land.
- `TODO_RETENTION_DAYS` unset → default **7**. Explicitly `0` → cleanup disabled entirely. Unset and `0` are different values; do not conflate them.
- Cleanup runs on a new daily Nitro scheduled task (`todos:cleanup`), separate from the existing per-minute `guild:resolve`.
- No client-side changes — `useTodos()`'s `refresh()` already reconciles a shrunk server list correctly, and idempotent mutation endpoints already handle a client mutating an already-removed todo.

---

### Task 1: Pure eligibility predicate

**Files:**
- Modify: `shared/types.ts` (add `isEligibleForCleanup` near the existing `getTaskState`)
- Test: `test/shared/types.test.ts` (extend the existing file)

**Interfaces:**
- Consumes: nothing new — uses the existing `Todo` type and `getTaskState` already in this file.
- Produces: `isEligibleForCleanup(todo: Pick<Todo, 'completedAt' | 'guildStatus' | 'chronicleWritten'>, retentionDays: number, now?: number): boolean` — Task 2's `deleteOldDoneTodos` imports this by name from `../../shared/types`.

- [ ] **Step 1: Write the failing tests**

Open `test/shared/types.test.ts` and add a new `describe` block. The full file currently looks like this (for reference — only add the new block, don't touch `isTodoNotFound`'s existing tests):

```ts
import { describe, it, expect } from 'vitest'
import { isTodoNotFound, isEligibleForCleanup } from '../../shared/types'
```

Add below the existing `describe('isTodoNotFound', ...)` block:

```ts
describe('isEligibleForCleanup', () => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = Date.parse('2026-08-17T00:00:00.000Z')

  function baseTodo(overrides: Partial<{ completedAt: string | null; guildStatus: 'init' | 'drafted' | 'chronicled'; chronicleWritten: boolean }>) {
    return {
      completedAt: null,
      guildStatus: 'init' as const,
      chronicleWritten: false,
      ...overrides
    }
  }

  it('is eligible when Done and older than the retention window', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 10 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(true)
  })

  it('is not eligible when Done but within the retention window', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 2 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is not eligible at exactly the retention boundary (strict greater-than)', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 7 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is not eligible for a To Do (never completed), no matter how old', () => {
    const todo = baseTodo({ completedAt: null, guildStatus: 'init' })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is not eligible for a Taking Shape todo, no matter how old', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 30 * DAY_MS).toISOString(),
      guildStatus: 'drafted',
      chronicleWritten: false
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is not eligible when guildStatus is chronicled but chronicleWritten is false (defensive guard)', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 10 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: false
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is never eligible when retentionDays is 0 (disabled), regardless of age', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 365 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    expect(isEligibleForCleanup(todo, 0, now)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/shared/types.test.ts`
Expected: FAIL — `isEligibleForCleanup` is not exported from `shared/types.ts`.

- [ ] **Step 3: Implement `isEligibleForCleanup`**

In `shared/types.ts`, add this directly below the existing `getTaskState` function:

```ts
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
  if (!todo.completedAt) return false
  const ageMs = now - new Date(todo.completedAt).getTime()
  return ageMs > retentionDays * 24 * 60 * 60 * 1000
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/shared/types.test.ts`
Expected: PASS, all 8 tests in the file (1 existing `isTodoNotFound` describe + the new `isEligibleForCleanup` describe with 7 cases).

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts test/shared/types.test.ts
git commit -m "feat: add isEligibleForCleanup predicate for todo retention"
```

---

### Task 2: Store function, config, and scheduled task

**Files:**
- Modify: `server/utils/store.ts` (add `deleteOldDoneTodos`)
- Modify: `nuxt.config.ts` (add `todoRetentionDays` runtimeConfig + `todos:cleanup` scheduled task entry)
- Create: `server/tasks/todos/cleanup.ts`
- Modify: `.env.example` (document `TODO_RETENTION_DAYS`)
- Modify: `README.md` (list the new task file under "What's here")
- Test: `test/server/todos-cleanup.e2e.test.ts`

**Interfaces:**
- Consumes: `isEligibleForCleanup` from `../../shared/types` (Task 1). `listTodos`/`saveTodos`/`withLock` already in `server/utils/store.ts`.
- Produces: `deleteOldDoneTodos(retentionDays: number): Promise<number>` (exported from `server/utils/store.ts`). The `todos:cleanup` Nitro task, invocable at `POST /_nitro/tasks/todos:cleanup`, returning `{ removed: number }` directly (Nitro's task-invocation endpoint returns whatever `run()` returns, unwrapped — verified against the existing `guild:resolve` task, which itself returns `{ result: ... }` and that's exactly what the endpoint echoes back with no further envelope).

- [ ] **Step 1: Write the failing e2e test**

Create `test/server/todos-cleanup.e2e.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Todo } from '../../shared/types'

const dataDir = mkdtempSync(join(tmpdir(), 'backlog-saga-test-'))
process.env.DATA_DIR = dataDir

await setup()

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

// Todos are seeded by writing todos.json directly into the isolated
// DATA_DIR rather than via the API: reaching guildStatus: 'chronicled'
// normally requires a live Ollama, which isn't available in this test
// environment, and completedAt needs to be backdated to simulate age,
// which no API endpoint supports.
function fixtureTodo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    title: 'Fixture todo',
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    category: 'cleaning',
    guildStatus: 'init',
    text: { init: 'placeholder' },
    chronicleWritten: false,
    version: 1,
    ...overrides
  }
}

describe('todos:cleanup task', () => {
  it('removes only Done todos older than the retention window, leaving everything else', async () => {
    const now = Date.now()
    const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString()

    const oldDone = fixtureTodo({
      id: 'old-done',
      completedAt: daysAgo(10),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    const recentDone = fixtureTodo({
      id: 'recent-done',
      completedAt: daysAgo(2),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    const oldTakingShape = fixtureTodo({
      id: 'old-taking-shape',
      completedAt: daysAgo(10),
      guildStatus: 'drafted',
      chronicleWritten: false
    })
    const oldTodo = fixtureTodo({
      id: 'old-todo',
      completedAt: null,
      guildStatus: 'init'
    })

    writeFileSync(join(dataDir, 'todos.json'), JSON.stringify([oldDone, recentDone, oldTakingShape, oldTodo]))

    const response = await $fetch<{ removed: number }>('/_nitro/tasks/todos:cleanup', { method: 'POST' })
    expect(response.removed).toBe(1)

    const remaining = await $fetch<Todo[]>('/api/todos')
    expect(remaining.map(t => t.id).sort()).toEqual(['old-taking-shape', 'old-todo', 'recent-done'])
  })

  it('removes nothing when TODO_RETENTION_DAYS is 0', async () => {
    process.env.TODO_RETENTION_DAYS = '0'
    try {
      const now = Date.now()
      const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString()
      const veryOldDone = fixtureTodo({
        id: 'very-old-done',
        completedAt: daysAgo(365),
        guildStatus: 'chronicled',
        chronicleWritten: true
      })
      writeFileSync(join(dataDir, 'todos.json'), JSON.stringify([veryOldDone]))

      const response = await $fetch<{ removed: number }>('/_nitro/tasks/todos:cleanup', { method: 'POST' })
      expect(response.removed).toBe(0)

      const remaining = await $fetch<Todo[]>('/api/todos')
      expect(remaining.map(t => t.id)).toEqual(['very-old-done'])
    } finally {
      delete process.env.TODO_RETENTION_DAYS
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/server/todos-cleanup.e2e.test.ts`
Expected: FAIL — `POST /_nitro/tasks/todos:cleanup` doesn't exist yet (404).

- [ ] **Step 3: Add `deleteOldDoneTodos` to the store**

In `server/utils/store.ts`, change the top import line from:

```ts
import type { Category, ChronicleEntry, Todo } from '../../shared/types'
```

to:

```ts
import { type Category, type ChronicleEntry, type Todo, isEligibleForCleanup } from '../../shared/types'
```

Then add this function, placed after `deleteTodo` (it's the same shape — a `withLock`-guarded write against the full list):

```ts
// Called once a day by the todos:cleanup scheduled task. retentionDays <= 0
// short-circuits before touching storage at all (isEligibleForCleanup would
// reject everything anyway, but this also skips an unnecessary read+write
// of the whole file when cleanup is disabled).
export async function deleteOldDoneTodos(retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  return withLock(async () => {
    const todos = await listTodos()
    const kept = todos.filter(t => !isEligibleForCleanup(t, retentionDays))
    const removed = todos.length - kept.length
    if (removed > 0) await saveTodos(kept)
    return removed
  })
}
```

- [ ] **Step 4: Add `todoRetentionDays` config and the scheduled task entry**

In `nuxt.config.ts`, add to `runtimeConfig` (after `codexDir`):

```ts
  runtimeConfig: {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:8b',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    codexDir: process.env.CODEX_DIR ? resolve(rootDir, process.env.CODEX_DIR) : '',
    // Days a Done todo stays in the Ledger after completion before the
    // daily todos:cleanup task removes it (its content already lives on
    // permanently in the Chronicle by that point). Unset defaults to 7.
    // Explicitly 0 disables cleanup entirely — unset and 0 are deliberately
    // different values, do not conflate them.
    todoRetentionDays: process.env.TODO_RETENTION_DAYS ? Number(process.env.TODO_RETENTION_DAYS) : 7
  },
```

And change the `scheduledTasks` entry:

```ts
    scheduledTasks: {
      '* * * * *': ['guild:resolve'],
      '0 3 * * *': ['todos:cleanup']
    },
```

- [ ] **Step 5: Create the scheduled task**

Create `server/tasks/todos/cleanup.ts`:

```ts
import { deleteOldDoneTodos } from '../../utils/store'

export default defineTask({
  meta: {
    name: 'todos:cleanup',
    description: 'Remove Done todos older than the configured retention window'
  },
  async run() {
    const retentionDays = useRuntimeConfig().todoRetentionDays as number
    if (retentionDays <= 0) {
      console.log(`[todos:cleanup] disabled (TODO_RETENTION_DAYS=${retentionDays})`)
      return { removed: 0 }
    }
    const removed = await deleteOldDoneTodos(retentionDays)
    console.log(`[todos:cleanup] removed ${removed} todos older than ${retentionDays}d`)
    return { removed }
  }
})
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- test/server/todos-cleanup.e2e.test.ts`
Expected: PASS, both tests.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS, all files including the two touched/added in this plan.

- [ ] **Step 8: Document the new env var and task**

In `.env.example`, add after `CODEX_DIR`:

```
# Days a Done todo stays in the Ledger after completion before the daily
# todos:cleanup task removes it — its content already lives on permanently
# in the Chronicle by that point. Defaults to 7 if unset. Set to 0 to
# disable cleanup entirely (unset and 0 are different: unset means "use
# the default 7").
TODO_RETENTION_DAYS=7
```

In `README.md`, find the "What's here" list item for
`server/tasks/guild/resolve.ts` and add a new bullet directly after it:

```
- `server/tasks/todos/cleanup.ts` — the daily scheduled task (`0 3 * * *`)
  that removes Done todos older than `TODO_RETENTION_DAYS` (default 7,
  `0` disables it) — their content is already permanently preserved in the
  Chronicle by the time they're eligible.
```

- [ ] **Step 9: Commit**

```bash
git add server/utils/store.ts nuxt.config.ts server/tasks/todos/cleanup.ts .env.example README.md test/server/todos-cleanup.e2e.test.ts
git commit -m "feat: add todos:cleanup scheduled task to remove old Done todos"
```

---

## Self-Review Notes

- **Spec coverage**: config/default/disable behavior → Task 2 Step 4; selection logic (Done-only, chronicleWritten guard, time boundary) → Task 1; new daily scheduled task, separate from guild:resolve → Task 2 Steps 4–5; no client changes → confirmed, no client files touched anywhere in this plan; testing plan's two items (unit test for selection logic, e2e test for the sweep) → Task 1 and Task 2 respectively.
- **Placeholder scan**: none found — every step has real code, no TBD/TODO.
- **Type consistency**: `isEligibleForCleanup`'s signature (`Pick<Todo, 'completedAt' | 'guildStatus' | 'chronicleWritten'>, retentionDays: number, now?: number`) is identical between its Task 1 definition and Task 2's usage (`isEligibleForCleanup(t, retentionDays)`, relying on `now`'s default). `deleteOldDoneTodos(retentionDays: number): Promise<number>` matches between its Task 2 definition and the task file's usage. `todoRetentionDays` is the same name in both `nuxt.config.ts` and `server/tasks/todos/cleanup.ts`'s `useRuntimeConfig().todoRetentionDays` read.
